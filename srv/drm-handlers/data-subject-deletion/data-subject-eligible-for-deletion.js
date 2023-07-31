const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('drm')
const { _getEntityForLegalGround, _buildWhereClauseForDSs, _getDataSubjectIDField, _getEndOfBusinessDateField, _getLegalEntityIDField, _getDataSubjectEmailField, _getDataSubjectNameField, whereForConditionSet, _getDataSubjectEntityByRole } = require('../../utils')

function serveDataSubjectEligibleForDeletion(srv, db) {

    /**
     * Return the list of data subjects associated 
     * with a given transactional data and data subject role for which the end of purpose has been reached.
     */
    srv.on(['endOfResidenceDS'], async req => {
        const { legalGround, dataSubjectRole, startTime, legalEntitiesResidenceRules} = req.data

        LOG.info(`Requested endOfResidenceDS for ${dataSubjectRole} and legal ground ${legalGround}`,
            `Start time field: ${startTime}`,
            `Residence rules:`, legalEntitiesResidenceRules)

        const legalGroundEntity = _getEntityForLegalGround(legalGround, srv)
        let where = {}
        const dsField = _getDataSubjectIDField(legalGroundEntity.elements)
        const eobField = startTime || _getEndOfBusinessDateField(legalGroundEntity.elements)
        const legalField = _getLegalEntityIDField(legalGroundEntity.elements)
        where[legalField] = {in: legalEntitiesResidenceRules.map(m => m.legalEntity)}
        
        const dataSubjectEntity = _getDataSubjectEntityByRole(dataSubjectRole, srv)
        if (!dataSubjectEntity) {
            return req.error({
                code: 'DATA_SUBJECT_ROLE_NOT_EXISTING',
                status: 400
            })
        }
        
        LOG.debug(`endOfResidenceDS, where clause for all data subjects`, where)
        const allDataSubjectsOfLegalGroundForLegalEntities = await SELECT.from(legalGroundEntity).where(where).columns(`${dsField} as dataSubjectID`, `count(${legalField}) as sumRecords`).groupBy(dsField)
        const allDataSubjectsOfLegalGround = await SELECT.from(legalGroundEntity).columns(`${dsField} as dataSubjectID`, `count(${legalField}) as sumRecords`).groupBy(dsField)

        LOG.debug(`endOfResidenceDS, result for all data subjects of this legal ground`, allDataSubjectsOfLegalGround)

        const dsFieldDataSubject = _getDataSubjectIDField(dataSubjectEntity.elements)
        const dataSubjectsWithoutLegalGround = await SELECT.from(dataSubjectEntity).where(allDataSubjectsOfLegalGround.length > 0 ? [
            {ref: [dsFieldDataSubject]},
            'not',
            'in',
            {list: allDataSubjectsOfLegalGround.map(ds => ({val: ds.dataSubjectID}))}
        ] : []).columns(`${dsFieldDataSubject} as dataSubjectID`)

        LOG.debug(`endOfResidenceDS, result for data subjects not related to this legal ground`, dataSubjectsWithoutLegalGround)
        const innerWhere = residenceRuleInnerWhereBuilding(legalEntitiesResidenceRules, legalField, eobField)
        
        where['and'] = {xpr: innerWhere}

        LOG.debug(`endOfResidenceDS, where clause for data subjects matching conditions`, where)
        const dataSubjectsMatchingConditions = await SELECT.distinct.from(legalGroundEntity)
            .where(where)
            .columns(`${dsField} as dataSubjectID`, `count(${legalField}) as sumRecords`).groupBy(dsField)
        LOG.debug(`endOfResidenceDS, result for data subjects matching conditions`, dataSubjectsMatchingConditions)
        const success = [...dataSubjectsAtEndOfRedisdence(allDataSubjectsOfLegalGroundForLegalEntities, dataSubjectsMatchingConditions), ...dataSubjectsWithoutLegalGround]
        const nonConfirmCondition = allDataSubjectsOfLegalGround.filter(ds => !success.some(s => s.dataSubjectID === ds.dataSubjectID))

        LOG.debug(`Successful requests`, success)
        LOG.debug(`nonConfirmCondition requests`, nonConfirmCondition)

        return {
            success: success,
            nonConfirmCondition: nonConfirmCondition
        }
    })

    function dataSubjectsAtEndOfRedisdence(allDataSubjectsOfLegalGround, dataSubjectsMatchingConditions, ) {
        const endOfResidenceDS = dataSubjectsMatchingConditions.reduce((acc, record) => {
            if (record.sumRecords === allDataSubjectsOfLegalGround.find(allRecord => allRecord.dataSubjectID === record.dataSubjectID).sumRecords)
                acc.push({dataSubjectID: record.dataSubjectID})
            return acc
        }, [])
        return endOfResidenceDS
    }

    function residenceRuleInnerWhereBuilding(legalEntitiesResidenceRules, legalField, eobField) {
        const innerWhere = []
        for(const {legalEntity, residenceRules = []} of legalEntitiesResidenceRules) {
            const residenceRulesConditions = []
            residenceRules.forEach(rule => {
                if(dayjs().isAfter(dayjs(rule.residenceDate))) {
                    if (residenceRulesConditions.length > 0) residenceRulesConditions.push('or')
                    const conditionAndResidenceDate = [
                        {ref: [eobField]},
                        '<',
                        {val: rule.residenceDate}
                    ]
                    if(rule.conditionSet.length > 0) {
                        conditionAndResidenceDate.push(
                            'and',
                            whereForConditionSet(rule.conditionSet)
                        )
                    }
                    residenceRulesConditions.push({xpr: conditionAndResidenceDate})
                }
            })
            if (innerWhere.length > 0) 
                innerWhere.push('or')
            const legalEntityResidenceRuleCondition = [
                {ref: [legalField]},
                '=',
                {val: legalEntity} 
            ]
            if (residenceRulesConditions.length > 0 )
                legalEntityResidenceRuleCondition.push(
                    'and',               
                    {xpr: residenceRulesConditions} 
                )    
            innerWhere.push({xpr: legalEntityResidenceRuleCondition}) 
        }
        return innerWhere
    } 

    srv.on(['endOfResidenceDSConfirmation'], async req => {
        const { legalGround, dataSubjectRole, startTime, dataSubjects = [], legalEntitiesResidenceRules } = req.data
        LOG.info(`Requested end of residence data subject confirmation for ${dataSubjectRole} and legal ground ${legalGround}`,
            `Start time field: ${startTime}`,
            `Residence rules:`, legalEntitiesResidenceRules)
        LOG.debug(`endOfResidenceDSConfirmation, data subject IDs`, dataSubjects)
        const dataSubjectIDs = dataSubjects.map(m => m.dataSubjectID).sort()
        const legalGroundEntity = _getEntityForLegalGround(legalGround, srv)
        let where = dataSubjectIDs.length > 0 ? _buildWhereClauseForDSs(legalGroundEntity, dataSubjectIDs) : {}
        const dsField = _getDataSubjectIDField(legalGroundEntity.elements)
        const eobField = startTime || _getEndOfBusinessDateField(legalGroundEntity.elements)
        const legalField = _getLegalEntityIDField(legalGroundEntity.elements)

        where[legalField] = {in: legalEntitiesResidenceRules.map(m => m.legalEntity)}

        const innerWhere = residenceRuleInnerWhereBuilding(legalEntitiesResidenceRules, legalField, eobField)
        where['and'] = {xpr: innerWhere}

        LOG.debug(`endOfResidenceDSConfirmation, where clause`, where)
        const [allDataSubjects, dataSubjectsMatchingConditions] = await Promise.all([
            SELECT.distinct.from(legalGroundEntity).where(_buildWhereClauseForDSs(legalGroundEntity, dataSubjectIDs)).columns(`${dsField} as dataSubjectID`, `count(${legalField}) as sumRecords`).groupBy(dsField).orderBy(dsField),
            SELECT.distinct.from(legalGroundEntity)
                .where(where)
                .columns(`${dsField} as dataSubjectID`, `count(${legalField}) as sumRecords`).groupBy(dsField)
        ])
        LOG.debug(`endOfResidenceDSConfirmation, result (not in format as drm would get it)`, dataSubjectsMatchingConditions)
        //If data subject does not have any legal ground it is also at the end of residence for this legal ground
        const dataSubjectsNotHavingARelatedLegalGround = dataSubjectIDs.reduce((acc, dataSubjectID) => {
            if (!allDataSubjects.some(ds => ds.dataSubjectID === dataSubjectID))
                acc.push({dataSubjectID: dataSubjectID})
            return acc
        }, [])
        return [...dataSubjectsAtEndOfRedisdence(allDataSubjects, dataSubjectsMatchingConditions), ...dataSubjectsNotHavingARelatedLegalGround]
    })

    srv.on('dataSubjectInformation', async req => {
        const { applicationGroupName, dataSubjectRole, dataSubjectIds } = req.data

        LOG.info(`Requested data Subject Information for ${dataSubjectRole} and application group ${applicationGroupName}`)
        LOG.debug(`Data subject info, data subject IDs`, dataSubjectIds)

        const entity = Object.entries(srv.entities).find(([name, value]) => value['@PersonalData.DataSubjectRole'] === dataSubjectRole && value['@PersonalData.EntitySemantics'] === 'DataSubject')
        if (!entity) return req.error({
            code: 'DATA_SUBJECT_ROLE_NOT_FOUND',
            status: 400
        })
        const [name, entityDefinition] = entity 
        let where = {}
        const dsIDField = _getDataSubjectIDField(entityDefinition.elements)
        where[dsIDField] = {in: dataSubjectIds}
        const result = await SELECT.from(entityDefinition).where(where).columns(
            `${dsIDField} as dataSubjectId`,
            `${_getDataSubjectNameField(entityDefinition)} as name`,
            `${_getDataSubjectEmailField(entityDefinition)} as emailId`
        )
        LOG.debug(`Data subject info result`, result)
        return result
    })
}


module.exports = serveDataSubjectEligibleForDeletion