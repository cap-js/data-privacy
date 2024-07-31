const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('drm')
const { _getEntityForLegalGround, _buildWhereClauseForDSs, _getDataSubjectIDField, _getEndOfBusinessDateField, _getLegalEntityIDField, _getDataSubjectEmailField, _getDataSubjectNameField, whereForConditionSet, _getDataSubjectEntityByRole, _buildWhereClauseForDSsArr } = require('../../utils')

function serveDataSubjectEligibleForDeletion(srv, db) {

    /**
     * Return the list of data subjects associated 
     * with a given transactional data and data subject role for which the end of purpose has been reached.
     */
    srv.on(['dataSubjectsEndOfResidence'], async req => {
        const { applicationName, iLMObjectName, dataSubjectRoleName, referenceDates} = req.data

        LOG.info(`Requested dataSubjectsEndOfResidence for ${dataSubjectRoleName} and iLM object ${iLMObjectName} and app ${applicationName}`,
            `Reference dates:`, JSON.stringify(referenceDates))

        const iLMObjectEntity = _getEntityForLegalGround(iLMObjectName, srv)
        const dsField = _getDataSubjectIDField(iLMObjectEntity.elements)
        const legalField = _getLegalEntityIDField(iLMObjectEntity.elements)

        const dataSubjectEntity = _getDataSubjectEntityByRole(dataSubjectRoleName, srv)
        if (!dataSubjectEntity) {
            return req.error({
                code: 'DATA_SUBJECT_ROLE_NOT_EXISTING',
                status: 400
            })
        }
        const wheres = whereClauseForRetentionSets(referenceDates);
        
        const [dataSubjectsMatchingConditions, dataSubjectsNotMatchingConditions] = await Promise.all([
            SELECT.distinct.from(iLMObjectEntity)
                .where(wheres.wheresWithCondition)
                .columns(`${dsField} as dataSubjectId`, `count(${legalField}) as sumRecords`).groupBy(dsField).orderBy(dsField),
            SELECT.distinct.from(iLMObjectEntity)
                .where(wheres.wheresWithNegConditions)
                .columns(`${dsField} as dataSubjectId`, `count(${legalField}) as sumRecords`).groupBy(dsField)
        ])
        
        LOG.debug(`Successful requests`, dataSubjectsMatchingConditions)
        LOG.debug(`nonConfirmCondition requests`, dataSubjectsNotMatchingConditions)

        return {
            success: dataSubjectsMatchingConditions.map(d => ({dataSubjectId: d.dataSubjectId})),
            nonConfirmCondition: dataSubjectsNotMatchingConditions.map(d => ({dataSubjectId: d.dataSubjectId}))
        }
    })

    srv.on(['dataSubjectsEndOfResidenceConfirmation'], async req => {
        const { applicationName, iLMObjectName, dataSubjectRoleName, dataSubjects = [], referenceDates } = req.data
        LOG.info(`Requested end of residence data subject confirmation for ${dataSubjectRoleName} and iLM object ${iLMObjectName} and app ${applicationName}`,
            `Reference dates:`, JSON.stringify(referenceDates))
        LOG.debug(`dataSubjectsEndOfResidenceConfirmation, data subject IDs`, dataSubjects)
        const dataSubjectIDs = dataSubjects.map(m => m.dataSubjectId)
        const legalGroundEntity = _getEntityForLegalGround(iLMObjectName, srv)
        const where = dataSubjectIDs.length > 0 ? _buildWhereClauseForDSsArr(legalGroundEntity, dataSubjectIDs) : []
        if (dataSubjectIDs.length > 0) where.push('and')
        const dsField = _getDataSubjectIDField(legalGroundEntity.elements)
        const legalField = _getLegalEntityIDField(legalGroundEntity.elements)

        const dataSubjectEntity = _getDataSubjectEntityByRole(dataSubjectRoleName, srv)
        if (!dataSubjectEntity) {
            return req.error({
                code: 'DATA_SUBJECT_ROLE_NOT_EXISTING',
                status: 400
            })
        }
        const wheres = whereClauseForRetentionSets(referenceDates);

        const [dataSubjectsMatchingConditions] = await Promise.all([
            SELECT.distinct.from(legalGroundEntity)
                .where(where.concat(wheres.wheresWithCondition))
                .columns(`${dsField} as dataSubjectId`, `count(${legalField}) as sumRecords`).groupBy(dsField).orderBy(dsField)
        ])

        LOG.debug(`Successful requests`, dataSubjectsMatchingConditions)

        return dataSubjectsMatchingConditions.map(d => ({dataSubjectId: d.dataSubjectId}))
    })

    srv.on('dataSubjectInformation', async req => {
        const { applicationName, dataSubjectRoleName, dataSubjects } = req.data

        LOG.info(`Requested data Subject Information for ${dataSubjectRoleName} and application ${applicationName}`)
        LOG.debug(`Data subject info, data subject IDs`, dataSubjects.map(d => d.dataSubjectId))

        const entity = Object.entries(srv.entities).find(([name, value]) => value['@PersonalData.DataSubjectRole'] === dataSubjectRoleName && value['@PersonalData.EntitySemantics'] === 'DataSubject')
        if (!entity) return req.error({
            code: 'DATA_SUBJECT_ROLE_NOT_FOUND',
            status: 400
        })
        const [name, entityDefinition] = entity 
        let where = {}
        const dsIDField = _getDataSubjectIDField(entityDefinition.elements)
        where[dsIDField] = {in: dataSubjects.map(d => d.dataSubjectId)}
        const result = await SELECT.from(entityDefinition).where(where).columns(
            `${dsIDField} as dataSubjectId`,
            `${_getDataSubjectNameField(entityDefinition)} as name`,
            `${_getDataSubjectEmailField(entityDefinition)} as emailId`
        )
        LOG.debug(`Data subject info result`, result)
        return result
    })

    function whereClauseForRetentionSets(referenceDates) {
        const wheresWithCondition = []
        const wheresWithNegConditions = []

        for (const ref of referenceDates) {
            for (const orgAttrRef of ref.organizationAttributeResidenceSet) {
                for (const residenceSet of orgAttrRef.residenceSet) {
                    const residenceSetWhere = [
                        {ref: [ref.referenceDateName]},
                        '<',
                        {val: residenceSet.retentionStartDate},
                        'and',
                        {ref: [orgAttrRef.organizationAttributeName]},
                        '=',
                        {val: orgAttrRef.organizationAttributeValue},
                    ]
                    const conditionWhere = whereForConditionSet(residenceSet.conditionSet)
                    if (conditionWhere.length > 0) {
                        LOG.debug(`Add condition in whereClauseForRetentionSets for residence set with start date ${residenceSet.retentionStartDate} `, conditionWhere)
                        wheresWithCondition.push(residenceSetWhere.concat('and', conditionWhere))
                        wheresWithNegConditions.push(residenceSetWhere.concat('and', 'not', {xpr: conditionWhere}))
                    } else {
                        wheresWithCondition.push(residenceSetWhere)
                        //If we do not have a conditionSet the not case has to be a wrong condition so that this does not return the same DP, IDs
                        wheresWithNegConditions.push(residenceSetWhere.concat('and', 'true', '=', 'false'))
                    }
                }
            }
        }
        const result = {
            wheresWithCondition: wheresWithCondition.map(w => ({xpr: w})).join('or'),
            wheresWithNegConditions: wheresWithNegConditions.map(w => ({xpr: w})).join('or')
        }
        LOG.debug('Wheres with condition: ', JSON.stringify(result.wheresWithCondition))
        LOG.debug('Wheres with inverted condition: ', JSON.stringify(result.wheresWithNegConditions))
        return result;
    }
}


module.exports = serveDataSubjectEligibleForDeletion