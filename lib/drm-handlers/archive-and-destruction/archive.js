const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('drm')
const { _getEndOfBusinessDateField, whereForSelectionCriteria, _getLegalEntityIDField, _getEntityForLegalGround, _getEntitiesForRole, _getDataSubjectIDField, whereForConditionSet, _getWholeObjectTree, _nullForeignKeysOnLegalGround } = require('../../utils')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)

function serveArchiveRequests(srv, db) {
    const {BlockingStore} = db.entities('sap.capire.blocking')

    //referenceDateName refers to the field on the legal ground which contains the date when end of business is reached and data has to be archived/blocked
    srv.on('endOfResidence', async req => {
        const {
            iLMObjectName: legalGround, selectionCriteria = [], retentionStartDate, 
            referenceDateName: endOfBusinessField, conditionSet = []
        } = req.data
        LOG.info('endOfResidence', req.data)
        const excludedConditionSets = req.data.excludedConditionSets ?? []
        LOG.info('endOfResidence excludedConditionSets', excludedConditionSets)

        const legalGroundEntity = _getEntityForLegalGround(legalGround, srv)
        
        const where = []
        const eobField = endOfBusinessField || _getEndOfBusinessDateField(legalGroundEntity.elements)
        where.push(
            {ref: [eobField]},
            '<', 
            {val: dayjs(retentionStartDate).utc().format('YYYY-MM-DDTHH:mm:ssZ')},
        )

        const selectionCriteriaXpr = whereForSelectionCriteria(selectionCriteria)

        if (selectionCriteriaXpr.length > 0) {
            where.push(
                'and',
                {xpr: selectionCriteriaXpr},
            )
        }

        const conditionXpr = whereForConditionSet(conditionSet)
        if (conditionXpr.length > 0) {
            where.push(
                'and',
                {xpr: conditionXpr},
            )
        }
        excludedConditionSets.forEach(e => {
            const conXpr = whereForConditionSet(e.conditionSet);
            where.push(
                'and',
                'not',
                {xpr: conXpr},
            )
        })
        LOG.info(`Requested End of residence for legal ground: ${legalGroundEntity.name}. Constructed where clause:`, where)

        const legalGroundEntities = await SELECT.from(legalGroundEntity).where(where)

        LOG.debug(`Result of end of residence query for legal ground: ${legalGroundEntity.name}:`, legalGroundEntities)

        const legalGroundKeys = Object.keys(legalGroundEntity.keys)
        
        const result = {
            iLMObjectInstancesArchiveCount: legalGroundEntities.length,
            iLMObjectInstances: legalGroundEntities.map(legal_ground => {
                return {
                    keys: legalGroundKeys.reduce((acc, val) => {
                        acc.push({
                            key: val,
                            value: legal_ground[val]
                        })
                        return acc
                    }, []),
                    retentionStartDate: dayjs(legal_ground[eobField]).format('YYYY-MM-DDTHH:mm:ss')
                }
            }),
            deltatoken: null,
        }
        LOG.debug(`Result returned:`, result)
        return result;
    })

    srv.on('archive', async req => {
        const {
            iLMObjectName, iLMObjectArchiveResidenceRules, referenceDateName
        } = req.data
        LOG.info(`archive`, req.data)  
        const iLMObjectEntity = _getEntityForLegalGround(iLMObjectName, srv);
        //Add check that end of business is crossed
        //Not sure if DRM intends this check - has to be checked with DRM team
        const where = [
            {ref: [referenceDateName]},
            '<',
            {val: `${dayjs().format('YYYY-MM-DDTHH:mm:ssZ')}`},
            'and',
            {xpr: where}
        ]       
        const allLegalGroundInstances = iLMObjectArchiveResidenceRules.reduce((acc, val) => {
            val.iLMObjectInstances.forEach(instance => {
                if (where.length > 0) where.push('or')
                where.push({xpr: instance.keys.reduce((acc, val) => {
                    if (acc.length !== 0) acc.push('and')
                    acc.push(
                        {ref: [val.key]},
                        '=',
                        {val: val.value}
                    )
                    return acc
                }, [])})
            })
            acc.push(
                ...val.iLMObjectInstances
            )
            return acc
        }, [])

        LOG.info(`Requested archive for legal ground: ${iLMObjectEntity.name}. Constructed where clause:`, where)

        const legalGroundEntities = await SELECT.from(iLMObjectEntity).where(where).columns(_getWholeObjectTree(iLMObjectEntity))
        LOG.debug(`Result of archive query for legal ground: ${iLMObjectEntity.name}:`, legalGroundEntities)

        let success = 0, failed = 0
        const archivedEntities = []
        for (const legal_ground of allLegalGroundInstances) {
            const iLMObject = legalGroundEntities.find(legalGround => {
                let result = true
                for (const key of legal_ground.keys) {
                    if ( !iLMObjectEntity.elements[key.key].key ){
                        req.error({
                            code: 'KEY_HAS_TO_BE_KEYFIELD_OF_LEGAL_GROUND',
                            status: 400
                        })
                    }
                    if (legalGround[key.key] !== key.value) {
                        result = false
                        break;
                    }
                }
                return result
            })
            if(req.errors){
                return req.errors
            }
            if (!iLMObject) {
                failed++
                continue
            }
            archivedEntities.push({
                ObjectType: iLMObjectEntity.name,     
                ObjectKey: legal_ground.keys[0].value, //TODO: Remove limitation
                ObjectAsBlob: JSON.stringify(iLMObject),  
                DataSubjectID: iLMObject[_getDataSubjectIDField(iLMObjectEntity.elements)],  
                dataSubjectRole: iLMObjectEntity['@PersonalData.DataSubjectRole'],
                EndOfRetentionDate: legal_ground.retentionEndDate
            })  
            success++
        }
        if (archivedEntities.length > 0) {
            LOG.info(`Archive request archiving the following entities:`, archivedEntities)
            await INSERT.into(BlockingStore).entries(archivedEntities)
            await Promise.all(_nullForeignKeysOnLegalGround(iLMObjectEntity, where)) //TODO: Think about feature flag
            await DELETE.from(iLMObjectEntity).where(where)
        } else {
            LOG.warn(`Archive request resulted in zero archived entities.`)
        }

        LOG.info(`Response for archive request. Successful archives ${success}. Failed archives: ${failed}`)

        return {
            success: success,
            failure: failed,
        }
    })
}


module.exports = serveArchiveRequests