const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('drm')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)

const { 
    _getEntityForLegalGround, 
    _buildWhereClauseForDS, 
    _getDataSubjectIDField, 
    _getEndOfBusinessDateField, 
    _getLegalEntityIDField, 
    whereForConditionSet, 
    _getWholeObjectTree,
    _getDataSubjectEntities,
    _nullForeignKeysOnLegalGround
} = require('../../utils')

function serveDataSubjectDeletion(srv, db) {

    const { BlockingStore } = cds.entities('sap.capire.blocking')
    
    srv.on('dataSubjectEndOfBusiness', async req => {
        const { legalGround, dataSubjectRole, dataSubjectID } = req.data
        LOG.info(`dataSubjectEndOfBusiness request for role ${dataSubjectRole} and ID ${dataSubjectID} and legal ground ${legalGround}.`)
        const legalGroundEntityDef = _getEntityForLegalGround(legalGround, srv)
        const where = _buildWhereClauseForDS(legalGroundEntityDef, dataSubjectID)
        const eobField = _getEndOfBusinessDateField(legalGroundEntityDef.elements)
        LOG.debug(`Where clause`, where)
        const result = await SELECT.one.from(legalGroundEntityDef).where(where).columns(`max(${eobField}) as endOfBusiness`)
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
                {val: dayjs(endOfBusinessDate).format('YYYY-MM-DDTHH:mm:ssZ')}
            )
            const result2 = await SELECT.one.from(legalGroundEntityDef).where(where).columns('ID')

            return `${dataSubjectRole} ${dataSubjectID} has a ${legalGroundEntityDef.name} with ID ${result2.ID} which reaches end of business on ${endOfBusinessDate}`
        }
        const response = {
            dataSubjectExpired: expired,
            dataSubjectNotExpiredReason: !expired ? await getNotExpiredReason(result.endOfBusiness) : ''
        }
        LOG.info(`dataSubjectEndOfBusiness outgoing response`, response)
        return response

    })

    srv.on('dataSubjectLegalEntities', async req => {
        const { legalGround, dataSubjectRole, dataSubjectID } = req.data
        LOG.info(`dataSubjectLegalEntities request for the legal ground ${legalGround}, the data subject role ${dataSubjectRole} with the data subject ID ${dataSubjectID}`)
        const legalGroundEntityDef = _getEntityForLegalGround(legalGround, srv)
        const where = _buildWhereClauseForDS(legalGroundEntityDef, dataSubjectID)
        const legalEntityField = _getLegalEntityIDField(legalGroundEntityDef.elements)
        LOG.debug(`where clause`, where)
        const result = await SELECT.from(legalGroundEntityDef).where(where).columns(`${legalEntityField} as legalEntity`)
        LOG.debug(`result`, result)
        return result
    })

    srv.on('retentionStartDate', async req => { 
        const { dataSubjectRole, legalEntity, startTime, dataSubjectID, legalGround, rulesConditionSet } = req.data
        LOG.info(`retentionStartDate request for the legal ground ${legalGround}, the data subject role ${dataSubjectRole}`,
            ` with the data subject ID ${dataSubjectID}.`,
            `The start time field is ${startTime} and the legal entity is ${legalEntity}`,
            `The rule condition set is`, rulesConditionSet)

        const legalGroundEntityDef = _getEntityForLegalGround(legalGround, srv)
        const eobField = startTime || _getEndOfBusinessDateField(legalGroundEntityDef.elements)
        const legalEntityField = _getLegalEntityIDField(legalGroundEntityDef.elements)

        const queries = []

        for (const rule of rulesConditionSet) {
            const where = _buildWhereClauseForDS(legalGroundEntityDef, dataSubjectID)
            where.push(
                'and',
                {ref: [eobField]},
                '<=',
                {val: dayjs().format('YYYY-MM-DD')},
                'and',
                {ref: [legalEntityField]},
                '=',
                {val: legalEntity},
            )
            if (rule.conditionSet.length > 0) {
                where.push(
                    'and', 
                    {xpr: whereForConditionSet(rule.conditionSet)}
                )
            }
            queries.push(
                SELECT.from(legalGroundEntityDef).where(where).columns(`max(${eobField}) as retentionStartDate`)
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
                retentionID: rulesConditionSet[idx].retentionID,
                retentionStartDate: dayjs(response[0].retentionStartDate).utc().format('YYYY-MM-DDTHH:mm:ss')
                //retentionStartDate: dayjs(response[0].retentionStartDate).utc(false).toISOString() //REVISIT: Proper but not chosen due to DRM strange handling
            }
        }) 
        LOG.debug(`retentionStartDate result`, result)
        return result
    })

    srv.on('deleteLegalGroundInstances', async req => {
        const { dataSubjectID, dataSubjectRole, maxDeletionDate,
            legalGround, retentionRules, startTime } = req.data
        LOG.info(`deleteLegalGroundInstances request for the legal ground ${legalGround}, the data subject role ${dataSubjectRole}`,
            ` with the data subject ID ${dataSubjectID}.`,
            `The start time field is ${startTime} and the maxDeletionDate is ${maxDeletionDate}`,
            `The retention rules are `, retentionRules)
        const legalGroundEntityDef = _getEntityForLegalGround(legalGround, srv)
        const where = _buildWhereClauseForDS(legalGroundEntityDef, dataSubjectID)
        
        //CHECK: eob check not needed per description
        const eobField = startTime || _getEndOfBusinessDateField(legalGroundEntityDef.elements)
        where.push(
            'and',
            {ref: [eobField]},
            '<=', 
            {val: dayjs().format('YYYY-MM-DD')}
        )
        
        const legalEntityField = _getLegalEntityIDField(legalGroundEntityDef.elements)
        
        let rulesWhere = []
        for(const {legalEntity, conditionSet} of retentionRules) {
            if(rulesWhere.length > 0) rulesWhere.push('or')
            rulesWhere.push(conditionSet.length > 0 ? {
                xpr: [
                    {ref: [legalEntityField]},
                    '=',
                    {val: legalEntity},
                    'and',
                    {xpr: whereForConditionSet(conditionSet)}
                ]
            } : {
                xpr: [
                    {ref: [legalEntityField]},
                    '=',
                    {val: legalEntity}
                ]
            })
        }
        where.push(
            'and',
            {xpr: rulesWhere}
        )
        LOG.info(`Where clause: `, where)
        const legalGroundEntities = await SELECT.from(legalGroundEntityDef).where(where).columns(_getWholeObjectTree(legalGroundEntityDef))
        //Return 204 if no records where found
        if (legalGroundEntities.length === 0) {
            req.res.statusCode = 204
            return 
        }

        const blockedEntries = []
        legalGroundEntities.forEach(legal_ground => {
            blockedEntries.push({
                ObjectType: legalGroundEntityDef.name,     
                ObjectKey: legal_ground.ID,
                ObjectAsBlob: JSON.stringify(legal_ground),
                DataSubjectID: dataSubjectID,
                dataSubjectRole: dataSubjectRole,
                EndOfRetentionDate: maxDeletionDate
            })  
        })
        if (blockedEntries.length > 0) {
            LOG.info(`Blocked entities`, blockedEntries)
            await INSERT.into(BlockingStore).entries(blockedEntries) 
        }
        await Promise.all(_nullForeignKeysOnLegalGround(legalGroundEntityDef, where)) //TODO: Think about feature flag
        await DELETE.from(legalGroundEntityDef).where(where)
        req.res.status(200)
        return {blockedLegalGrounds: blockedEntries.length}
    })

    srv.on(['destroyLegalGroundInstances'], async req => {
        const { dataSubjectRole, legalGround } = req.data
        LOG.info(`Destroy legal grounds request for role ${dataSubjectRole} and legal ground ${legalGround} where end of retention is reached.`)
        const legalGroundEntityDef = _getEntityForLegalGround(legalGround, srv)
        if (!legalGroundEntityDef) {
            return req.error({
                code: 'INVALID_LEGAL_GROUND',
                status: 400
            })
        }
        const whereCondition = {
            ObjectType: legalGroundEntityDef.name,     
            dataSubjectRole: dataSubjectRole,
            EndOfRetentionDate: {'<=': dayjs().format('YYYY-MM-DDTHH:mm:ssZ')},
        }
        LOG.info(`Where condition for destroy from blocking store.`, whereCondition)
        await DELETE.from(BlockingStore).where(whereCondition)
        req.res.statusCode = 202
    })

    srv.on('deleteDataSubject', async req => {
        const { applicationGroupName, dataSubjectRole, dataSubjectID, maxDeletionDate } = req.data
        LOG.info(`Delete data subject request for role ${dataSubjectRole}, ID ${dataSubjectID} and application group ${applicationGroupName} with end of retention ${maxDeletionDate}.`)
        const dsEntities = _getDataSubjectEntities(dataSubjectRole, srv) //Ensures that data subject details are also retrived
        if (dsEntities.length === 0 || !cds.env.requires.drm.legalGroundPerDataSubject[dataSubjectRole]) 
            return req.error('Non existing data subject')
        //Delete if there are no active legal grounds for data subject
        for (const {legalGround} of cds.env.requires.drm.legalGroundPerDataSubject[dataSubjectRole]) {
            const entity = srv.entities[legalGround]
            LOG.debug(`Where clause for getting active entities`, _buildWhereClauseForDS(entity, dataSubjectID))
            const activeRecords = await cds.db.exists(entity).where(_buildWhereClauseForDS(entity, dataSubjectID))
            if (activeRecords) { 
                LOG.info(`Delete data subject for ${dataSubjectRole}, ID ${dataSubjectID} does not work due to active entities in ${entity}.`)
                return req.error({message: 'Active records still exist for the entity', code: 400})
            }
        }

        //Check if there are blocked records
        const blockedData = await cds.db.exists(BlockingStore).where({DataSubjectID: dataSubjectID})
        for (const singleEntity of dsEntities) {
            const entity = await SELECT.one.from(singleEntity).where(_buildWhereClauseForDS(singleEntity, dataSubjectID)).columns(_getWholeObjectTree(singleEntity))
            LOG.debug(`Where clause for getting ${singleEntity.name}`, _buildWhereClauseForDS(singleEntity, dataSubjectID),`with result`, entity)
            if (!entity) continue
            if (dayjs().isAfter(maxDeletionDate) || blockedData)
                await INSERT.into(BlockingStore).entries([{
                    ObjectType: singleEntity.name,     
                    ObjectKey: entity[_getDataSubjectIDField(singleEntity.elements)],
                    ObjectAsBlob: JSON.stringify(entity),
                    DataSubjectID: dataSubjectID,
                    dataSubjectRole: dataSubjectRole,
                    EndOfRetentionDate: maxDeletionDate
                }])  
            await DELETE.from(singleEntity.name).where(_buildWhereClauseForDS(singleEntity, dataSubjectID))
            LOG.info(`Deleted data subject:`, dataSubjectID)
        }
    })

    srv.on('destroyDataSubjects', async req => {
        const { applicationGroupName, dataSubjectRole } = req.data
        LOG.info(`Destroy data subjects request for role ${dataSubjectRole} and application group ${applicationGroupName} where end of retention is reached.`)
        //Delete only possible if all legal grounds also reached end of blocking

        const dataSubjectIDs = await SELECT.from(BlockingStore).where({dataSubjectRole: dataSubjectRole})
            .groupBy('DataSubjectID')
            .columns('max(EndOfRetentionDate) as lastEndOfRetention', 'DataSubjectID')
            .having(`lastEndOfRetention <= '${dayjs().format('YYYY-MM-DDTHH:mm:ssZ')}'`)
        if (dataSubjectIDs.length === 0) return
        const dataSubjectIDsToDestroy = []
        for (const {DataSubjectID: dataSubjectID} of dataSubjectIDs) {
            let hasActiveRecords = false
            for (const entityName in srv.entities) { //srv.entities may cause problems as we do not check the whole data model
                const entity = srv.entities[entityName]
                if (entity && entity['@PersonalData.EntitySemantics'] === 'Other') {
                    const dataSubjectIDField = _getDataSubjectIDField(entity.elements)
                    const where = {}
                    where[dataSubjectIDField] = dataSubjectID
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
            await DELETE.from(BlockingStore).where({DataSubjectID: {in: dataSubjectIDsToDestroy}})
        }
        req.res.statusCode = 202
        return req.info(`Destroyed ${dataSubjectIDsToDestroy.length} records`)
    })
    
}


module.exports = serveDataSubjectDeletion