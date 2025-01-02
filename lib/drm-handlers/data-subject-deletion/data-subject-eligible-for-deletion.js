const cds = require('@sap/cds'), LOG = cds.log('data-privacy')
const { _getEntityForILMObject, _getDataSubjectIDField, _getLegalEntityIDField, _getDataSubjectEmailField, _getDataSubjectNameField, whereForConditionSet, _getDataSubjectEntityByRole, _buildWhereClauseForDSsArr } = require('../../utils')

function serveDataSubjectEligibleForDeletion(srv) {

    /**
     * Return the list of data subjects associated 
     * with a given transactional data and data subject role for which the end of purpose has been reached.
     */
    srv.on(['dataSubjectsEndOfResidence'], async req => {
        const { applicationName, iLMObjectName, dataSubjectRoleName, referenceDates} = req.data

        LOG.info(`Requested dataSubjectsEndOfResidence for ${dataSubjectRoleName} and iLM object ${iLMObjectName} and app ${applicationName}`,
            `Reference dates:`, JSON.stringify(referenceDates))

        const iLMObjectEntity = _getEntityForILMObject(iLMObjectName, srv)
        const dsField = _getDataSubjectIDField(iLMObjectEntity.elements)
        const legalField = _getLegalEntityIDField(iLMObjectEntity.elements)

        const dataSubjectEntity = _getDataSubjectEntityByRole(dataSubjectRoleName, srv)
        //Second condition for case that role is dynamic
        if (!dataSubjectEntity && !iLMObjectEntity['@PersonalData.DataSubjectRole']['=']) {
            return req.error({
                code: 'DATA_SUBJECT_ROLE_NOT_EXISTING',
                status: 400
            })
        }
        const wheres = whereClauseForRetentionSets(referenceDates, iLMObjectEntity, dataSubjectRoleName);
        
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
        const iLMObjectEntity = _getEntityForILMObject(iLMObjectName, srv)
        const where = dataSubjectIDs.length > 0 ? _buildWhereClauseForDSsArr(iLMObjectEntity, dataSubjectIDs) : []
        const dsField = _getDataSubjectIDField(iLMObjectEntity.elements)
        const legalField = _getLegalEntityIDField(iLMObjectEntity.elements)

        const dataSubjectEntity = _getDataSubjectEntityByRole(dataSubjectRoleName, srv)
        //Second condition for case that role is dynamic
        if (!dataSubjectEntity && !iLMObjectEntity['@PersonalData.DataSubjectRole']?.['=']) {
            return req.error({
                code: 'DATA_SUBJECT_ROLE_NOT_EXISTING',
                status: 400
            })
        }
        const wheres = whereClauseForRetentionSets(referenceDates, iLMObjectEntity, dataSubjectRoleName);
        if (wheres.wheresWithCondition.length > 0) where.push('and')
        const [dataSubjectsMatchingConditions] = await Promise.all([
            SELECT.distinct.from(iLMObjectEntity)
                .where(where.concat(wheres.wheresWithCondition))
                .columns(`${dsField} as dataSubjectId`, `count(${legalField}) as sumRecords`).groupBy(dsField).orderBy(dsField)
        ])

        LOG.debug(`Successful requests`, dataSubjectsMatchingConditions)

        return dataSubjectsMatchingConditions.map(d => ({dataSubjectId: d.dataSubjectId}))
    })

    srv.on('dataSubjectInformation', async req => {
        const { applicationName, dataSubjectRoleName, dataSubjects } = req.data

        LOG.info(`Requested data subject information for ${dataSubjectRoleName} and application ${applicationName}`)
        LOG.debug(`Data subject info, data subject IDs`, dataSubjects.map(d => d.dataSubjectId))

        //In theory there can be multiple entities for the same DataSubject or a combination of entities with a fixed or dynamic role
        const entityDefinitions = Object.values(srv.entities).filter(value => (value['@PersonalData.DataSubjectRole']?.['='] || value['@PersonalData.DataSubjectRole'] === dataSubjectRoleName) && value['@PersonalData.EntitySemantics'] === 'DataSubject')
        if (entityDefinitions.length === 0) return req.error({
            code: 'DATA_SUBJECT_ROLE_NOT_FOUND',
            status: 400
        });
        const queries = []
        for (const entity of entityDefinitions) {
            const dsIDField = _getDataSubjectIDField(entity.elements)
            const where = [
                {ref: [dsIDField]},
                'in',
                {list: dataSubjects.map(d => ({val: d.dataSubjectId}))}
            ]
            //In case the role is a path and thus dynamic. For example there could be a 
            // users entity which is used for Employees and Customers alike
            if (entity['@PersonalData.DataSubjectRole']?.['=']) {
                where.push(
                    'and',
                    {ref: entity['@PersonalData.DataSubjectRole']['=']},
                    '=',
                    {val: dataSubjectRoleName}
                )
            }
            queries.push(SELECT.from(entity).where(where).columns(
                `${dsIDField} as dataSubjectId`,
                `${_getDataSubjectNameField(entity)} as name`,
                `${_getDataSubjectEmailField(entity)} as emailId`
            ))
        }
        let result = [];
        const results = await Promise.all(queries);
        results.forEach(res => {
            result = result.concat(res);
        });
        LOG.debug(`Data subject info result`, result);
        return result;
    })

    function whereClauseForRetentionSets(referenceDates, iLMObjectEntity, dataSubjectRoleName) {
        const wheresWithCondition = []
        const wheresWithNegConditions = []

        for (const ref of referenceDates) {
            for (const orgAttrRef of ref.organizationAttributeResidenceSet) {
                for (const residenceSet of orgAttrRef.residenceSet) {
                    const orgAttributeName = iLMObjectEntity.elements[orgAttrRef.organizationAttributeName] ? orgAttrRef.organizationAttributeName : _getLegalEntityIDField(iLMObjectEntity.elements)
                    if (!iLMObjectEntity.elements[orgAttrRef.organizationAttributeName]) {
                        LOG.warn(`data subject deletion triggered with org attribute ${orgAttrRef.organizationAttributeName} not given on entity ${iLMObjectEntity.name}. Using element ${orgAttributeName} instead.`)
                    }
                    const residenceSetWhere = [
                        {ref: [ref.referenceDateName]},
                        '<',
                        {val: residenceSet.retentionStartDate},
                    ]
                    if (dataSubjectRoleName && iLMObjectEntity['@PersonalData.DataSubjectRole']['=']) {
                        residenceSetWhere.push(
                            'and',
                            {ref: iLMObjectEntity['@PersonalData.DataSubjectRole']['=']},
                            '=',
                            {val: dataSubjectRoleName},
                        )
                    }
                    if (orgAttributeName) {
                        residenceSetWhere.push(
                            'and',
                            {ref: [orgAttributeName]},
                            '=',
                            {val: orgAttrRef.organizationAttributeValue},
                        )
                    } else {
                        LOG.warn(`No org attribute given on the entity. Ignoring the condition: ${orgAttrRef.organizationAttributeName} = ${orgAttrRef.organizationAttributeValue}`)
                    }
                    const conditionWhere = whereForConditionSet(residenceSet.conditionSet)
                    if (conditionWhere.length > 0) {
                        LOG.debug(`Add condition in whereClauseForRetentionSets for residence set with start date ${residenceSet.retentionStartDate} `, conditionWhere)
                        wheresWithCondition.push(residenceSetWhere.concat('and', conditionWhere))
                        wheresWithNegConditions.push(residenceSetWhere.concat('and', 'not', {xpr: conditionWhere}))
                    } else {
                        wheresWithCondition.push(residenceSetWhere)
                        //If we do not have a conditionSet the not case has to be a wrong condition so that this does not return the same DP, IDs
                        wheresWithNegConditions.push(residenceSetWhere.concat(['and', {val: true}, '=', {val: false}]))
                    }
                }
            }
        }
        const result = {
            wheresWithCondition: wheresWithCondition.reduce((acc, w) => {
                if (acc.length > 0) acc.push('or');
                acc.push({xpr: w});
                return acc;
            }, []),
            wheresWithNegConditions: wheresWithNegConditions.reduce((acc, w) => {
                if (acc.length > 0) acc.push('or');
                acc.push({xpr: w});
                return acc;
            }, [])
        }
        LOG.debug(`Wheres result: ${JSON.stringify(result)}`)
        return result;
    }
}


module.exports = serveDataSubjectEligibleForDeletion