const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('data-privacy')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)

const { 
    _getEntityForILMObject, 
    _buildWhereClauseForDS, 
    _getDataSubjectIDField, 
    _getEndOfBusinessDateField, 
    _getLegalEntityIDField, 
    whereForConditionSet, 
    _getWholeObjectTree,
    _getDataSubjectEntities,
    _nullForeignKeysOnILMObject
} = require('../../utils')
const { getDPIentities } = require('../../model/get-dpi-entities')

function serveDataSubjectDeletion(srv) {

    const { BlockingStore } = cds.entities('sap.capire.blocking')
    
    srv.on('dataSubjectEndOfBusiness', async req => {
        const { applicationName, iLMObjectName: iLMObject, dataSubjectRoleName: dataSubjectRole, dataSubjectId: dataSubjectID } = req.data
        LOG.info(`dataSubjectEndOfBusiness request for role ${dataSubjectRole} and ID ${dataSubjectID} and iLMObject ${iLMObject} and app ${applicationName}.`)
        const iLMObjectEntityDef = _getEntityForILMObject(iLMObject, srv)
        const where = _buildWhereClauseForDS(iLMObjectEntityDef, dataSubjectID, dataSubjectRole)
        const eobField = _getEndOfBusinessDateField(iLMObjectEntityDef.elements)
        LOG.debug(`Where clause`, where)
        const result = await SELECT.one.from(iLMObjectEntityDef).where(where).columns(`max(${eobField}) as endOfBusiness`)
        if (!result || (result && !result.endOfBusiness)) {
            req.res.statusCode = 204 //DRM defines to respond with 204 when no transactional item was found
            return
        }
        LOG.debug(`Result of select`, result)
        const expired = dayjs().isSameOrAfter(result.endOfBusiness)
        const getNotExpiredReason = async (endOfBusinessDate) => {
            where.push(
                'and',
                {ref: [eobField]},
                '=',
                {val: endOfBusinessDate}
            )
            const result2 = await SELECT.one.from(iLMObjectEntityDef).where(where).columns('ID')

            return `${dataSubjectRole} ${dataSubjectID} has a ${iLMObjectEntityDef.name} entity with ID ${result2.ID} which reaches end of business on ${endOfBusinessDate}`
        }
        const response = {
            dataSubjectExpired: expired,
            dataSubjectNotExpiredReason: !expired ? await getNotExpiredReason(result.endOfBusiness) : ''
        }
        LOG.info(`dataSubjectEndOfBusiness outgoing response`, response)
        return response

    })

    srv.on('dataSubjectOrganizationAttributeValues', async req => {
        const { applicationName, organizationAttributeName, iLMObjectName: iLMObject, dataSubjectRoleName: dataSubjectRole, dataSubjectId: dataSubjectID } = req.data
        LOG.info(`dataSubjectOrganizationAttributeValues request for the iLMObject ${iLMObject}, the data subject role ${dataSubjectRole} with the data subject ID ${dataSubjectID} and app ${applicationName} and org attribute ${organizationAttributeName}`)
        const iLMObjectEntityDef = _getEntityForILMObject(iLMObject, srv)
        const where = _buildWhereClauseForDS(iLMObjectEntityDef, dataSubjectID, dataSubjectRole)
        const legalEntityField = organizationAttributeName ?? _getLegalEntityIDField(iLMObjectEntityDef.elements)
        LOG.debug(`where clause`, where);
        if (!iLMObjectEntityDef.elements[legalEntityField] || iLMObjectEntityDef.elements[legalEntityField]?.['@PersonalData.FieldSemantics'] !== 'LegalEntityID') {
            return req.error({
                code: 'ORG_ATTRIBUTE_NOT_EXISTING',
                status: 400
            })
        }
        const result = await SELECT.distinct.from(iLMObjectEntityDef).where(where).columns(`${legalEntityField} as organizationAttributeValue`);
        LOG.debug(`result`, result)
        return result
    })

    srv.on('dataSubjectLatestRetentionStartDates', async req => { 
        const { applicationName, dataSubjectRoleName: dataSubjectRole, organizationAttributeName, organizationAttributeValue, referenceDateName: startTime, dataSubjectId: dataSubjectID, iLMObjectName: iLMObject, retentionSet } = req.data
        LOG.info(`dataSubjectLatestRetentionStartDates request for the iLMObject ${iLMObject}, the data subject role ${dataSubjectRole}`,
            ` with the data subject ID ${dataSubjectID}.`,
            `Application: ${applicationName}`,
            `The start time field is ${startTime} and the org attribute ${organizationAttributeName} with value ${organizationAttributeValue}`,
            `The retention condition set is`, retentionSet)

        const iLMObjectEntityDef = _getEntityForILMObject(iLMObject, srv)
        const eobField = startTime || _getEndOfBusinessDateField(iLMObjectEntityDef.elements)
        const legalEntityField = organizationAttributeName ?? _getLegalEntityIDField(iLMObjectEntityDef.elements)

        const queries = []

        for (const rule of retentionSet) {
            const where = _buildWhereClauseForDS(iLMObjectEntityDef, dataSubjectID, dataSubjectRole)
            where.push(
                'and',
                {ref: [eobField]},
                '<=',
                {val: dayjs().format('YYYY-MM-DD')},
                'and',
                {ref: [legalEntityField]},
                '=',
                {val: organizationAttributeValue},
            )
            if (rule.conditionSet.length > 0) {
                where.push(
                    'and', 
                    {xpr: whereForConditionSet(rule.conditionSet)}
                )
            }
            queries.push(
                SELECT.from(iLMObjectEntityDef).where(where).columns(`max(${eobField}) as retentionStartDate`)
            )
        }


        const results = await Promise.all(queries)
        //Return 204 if no retention start dates where found, e.g. no transactional data instances were found
        if (!results.some(s => s[0].retentionStartDate !== null)) {
            req.res.statusCode = 204
            return
        }

        const result = results.map((response, idx) => {
            return {
                retentionSetId: retentionSet[idx].retentionSetId,
                retentionStartDate: dayjs(response[0].retentionStartDate).format('YYYY-MM-DDTHH:mm:ss')
                //retentionStartDate: dayjs(response[0].retentionStartDate).utc(false).toISOString() //REVISIT: Proper but not chosen due to DRM strange handling
            }
        }) 
        LOG.debug(`retentionStartDate result`, result)
        return result
    })

    srv.on('dataSubjectILMObjectInstanceBlocking', async req => {
        const { applicationName, dataSubjectId: dataSubjectID, dataSubjectRoleName: dataSubjectRole, maxDeletionDate,
            iLMObjectName } = req.data
        LOG.info(`dataSubjectILMObjectInstanceBlocking request for the iLMObject ${iLMObjectName}, the data subject role ${dataSubjectRole}`,
            ` with the data subject ID ${dataSubjectID}.`,
            `App is ${applicationName}`,
            `The maxDeletionDate is ${maxDeletionDate}`)
        const iLMObjectEntityDef = _getEntityForILMObject(iLMObjectName, srv)
        if (!iLMObjectEntityDef) {
            return req.error({
                code: 'INVALID_LEGAL_GROUND',
                status: 400
            })
        }
        const where = _buildWhereClauseForDS(iLMObjectEntityDef, dataSubjectID, dataSubjectRole)
        LOG.info(`Where clause: `, where)
        const toBeBlocked = await SELECT.from(iLMObjectEntityDef).where(where).columns(_getWholeObjectTree(iLMObjectEntityDef, dataSubjectRole))
        //Return 204 if no records where found
        if (toBeBlocked.length === 0) {
            req.res.statusCode = 204
            return 
        }

        const blockedEntries = []
        toBeBlocked.forEach(iLMObject => {
            blockedEntries.push({
                objectType: iLMObjectEntityDef.name,     
                objectKey: iLMObject.ID,
                objectAsBlob: JSON.stringify(iLMObject),
                dataSubjectID: dataSubjectID,
                dataSubjectRole: iLMObject['dataSubjectRole'] ?? dataSubjectRole,
                endOfRetentionDate: maxDeletionDate
            })  
        })
        if (blockedEntries.length > 0) {
            LOG.info(`Blocked entities`, blockedEntries)
            await INSERT.into(BlockingStore).entries(blockedEntries) 
        }
        await Promise.all(_nullForeignKeysOnILMObject(iLMObjectEntityDef, where)) //TODO: Think about feature flag
        await DELETE.from(iLMObjectEntityDef).where(where)
        req.res.status(200)
        return blockedEntries.length //We return something because returning nothng would cause 204 and 204 means we did not find any data
    })

    srv.on(['dataSubjectsILMObjectInstancesDestroying'], async req => {
        const { applicationName, dataSubjectRoleName: dataSubjectRole, iLMObjectName: iLMObject } = req.data
        LOG.info(`Destroy iLMObjects request for role ${dataSubjectRole} and iLMObject ${iLMObject} where end of retention is reached for app ${applicationName}.`)
        const iLMObjectEntityDef = _getEntityForILMObject(iLMObject, srv)
        if (!iLMObjectEntityDef) {
            return req.error({
                code: 'INVALID_LEGAL_GROUND',
                status: 400
            })
        }
        const whereCondition = {
            objectType: iLMObjectEntityDef.name,     
            dataSubjectRole: dataSubjectRole,
            endOfRetentionDate: {'<=': dayjs().format('YYYY-MM-DDTHH:mm:ssZ')},
        }
        LOG.info(`Where condition for destroy from blocking store.`, whereCondition)
        await DELETE.from(BlockingStore).where(whereCondition)
        req.res.statusCode = 202
    })

    srv.on('dataSubjectBlocking', async req => {
        const { applicationName, dataSubjectRoleName: dataSubjectRole, dataSubjectId: dataSubjectID, maxDeletionDate } = req.data
        LOG.info(`Delete data subject request for role ${dataSubjectRole}, ID ${dataSubjectID} and application group ${applicationName} with end of retention ${maxDeletionDate}.`)
        const dsEntities = _getDataSubjectEntities(dataSubjectRole, srv); //Ensures that data subject details are also retrived
        const model = cds.context?.model ?? cds.model;
        if (!model._iLMObjects) {
            const res = getDPIentities(model);
            model._iLMObjects = res.iLMObjects;
        }
        if (dsEntities.length === 0 || !model._iLMObjects) 
            return req.error('Non existing data subject')
        //Delete if there are no active iLMObjects for data subject
        for (const iLMObject of model._iLMObjects) {
            const iLMObjectDef = _getEntityForILMObject(iLMObject.iLMObjectName, srv);
            LOG.debug(`Where clause for getting active entities`, _buildWhereClauseForDS(iLMObjectDef, dataSubjectID, dataSubjectRole))
            const activeRecords = await cds.db.exists(iLMObjectDef).where(_buildWhereClauseForDS(iLMObjectDef, dataSubjectID, dataSubjectRole))
            if (activeRecords) { 
                LOG.info(`Delete data subject for ${dataSubjectRole}, ID ${dataSubjectID} does not work due to active entities in ${iLMObjectDef.name}.`)
                return req.error({message: 'Active records still exist for the entity', code: 400})
            }
        }

        //Check if there are blocked records
        const blockedData = await cds.db.exists(BlockingStore).where({dataSubjectID: dataSubjectID, dataSubjectRole: dataSubjectRole})
        for (const singleEntity of dsEntities) {
            const entity = await SELECT.one.from(singleEntity).where(_buildWhereClauseForDS(singleEntity, dataSubjectID, dataSubjectRole)).columns(_getWholeObjectTree(singleEntity, dataSubjectRole))
            LOG.debug(`Where clause for getting ${singleEntity.name}`, _buildWhereClauseForDS(singleEntity, dataSubjectID, dataSubjectRole),`with result`, entity)
            if (!entity) continue
            //dayjs() gives you the current date, if it is greater than maxDeletionDate then the data subject can deleted immediately
            //deleting immediately only allowed when no associated iLMObjects in blocking store
            if (dayjs().isBefore(maxDeletionDate) || blockedData)
                await INSERT.into(BlockingStore).entries([{
                    objectType: singleEntity.name,     
                    objectKey: entity[_getDataSubjectIDField(singleEntity.elements)],
                    objectAsBlob: JSON.stringify(entity),
                    dataSubjectID: dataSubjectID,
                    dataSubjectRole: entity['dataSubjectRole'] ?? dataSubjectRole,
                    endOfRetentionDate: maxDeletionDate
                }])  
            await DELETE.from(singleEntity.name).where(_buildWhereClauseForDS(singleEntity, dataSubjectID))
            LOG.info(`Deleted data subject:`, dataSubjectID)
        }
    })

    srv.on('dataSubjectsDestroying', async req => {
        const { applicationName, dataSubjectRoleName: dataSubjectRole } = req.data
        LOG.info(`Destroy data subjects request for role ${dataSubjectRole} and application group ${applicationName} where end of retention is reached.`)
        //Delete only possible if all iLMObjects also reached end of blocking

        const dataSubjectIDs = await SELECT.from(BlockingStore).where({dataSubjectRole: dataSubjectRole})
            .groupBy('dataSubjectID')
            .columns('max(endOfRetentionDate) as lastEndOfRetention', 'dataSubjectID')
            .having(`endOfRetentionDate <= '${dayjs().format('YYYY-MM-DDTHH:mm:ssZ')}'`)
        if (dataSubjectIDs.length === 0) return
        const dataSubjectIDsToDestroy = []
        for (const {dataSubjectID} of dataSubjectIDs) {
            let hasActiveRecords = false
            for (const entityName in srv.entities) { //srv.entities may cause problems as we do not check the whole data model
                const entity = srv.entities[entityName]
                if (entity && entity['@PersonalData.EntitySemantics'] === 'Other') {
                    const dataSubjectIDField = _getDataSubjectIDField(entity.elements)
                    if(!dataSubjectIDField) continue
                    const where = []
                    where.push({ref: [dataSubjectIDField]}, '=', {val: dataSubjectID});
                    //For dynamic data subject role - then it is a path.
                    if (entity['@PersonalData.DataSubjectRole']?.['=']) {
                        where.push(
                            'and',
                            {ref: entity['@PersonalData.DataSubjectRole']['=']},
                            '=',
                            {val: dataSubjectRole}
                        )
                    } else if (entity['@PersonalData.DataSubjectRole'] !== dataSubjectRole) {
                        LOG.debug(`Active records in ${entity} for data subject ${dataSubjectID} are not checked because the role ${dataSubjectRole} does not match the annotated role ${entity['@PersonalData.DataSubjectRole']}`)
                        continue;
                    }
                    const activeRecords = await cds.db.exists(entity).where(where)
                    LOG.info(`Data subject ${dataSubjectID} has active records in ${entity} and cannot be destroyed`)
                    if (activeRecords) {
                        hasActiveRecords = true
                        break;
                    }
                }
            }
            if (!hasActiveRecords)
                dataSubjectIDsToDestroy.push(dataSubjectID)
        }
        if (dataSubjectIDsToDestroy.length > 0) {
            LOG.info(`Destroy data subjects with the ID`, dataSubjectIDsToDestroy)
            await DELETE.from(BlockingStore).where({dataSubjectID: {in: dataSubjectIDsToDestroy}})
        }
        req.res.statusCode = 200
        return `Destroyed ${dataSubjectIDsToDestroy.length} records`
    })
    
}


module.exports = serveDataSubjectDeletion