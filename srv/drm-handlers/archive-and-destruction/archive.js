const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('drm')
const { _getEndOfBusinessDateField, whereForSelectionCriteria, _getLegalEntityIDField, _getEntityForLegalGround, _getEntitiesForRole, _getDataSubjectIDField, whereForConditionSet, _getWholeObjectTree, _nullForeignKeysOnLegalGround } = require('../../utils')


function serveArchiveRequests(srv, db) {
    const {BlockingStore} = db.entities('sap.capire.blocking')

    //startTime refers to the field on the legal ground which contains the date when end of business is reached and data has to be archived/blocked
    srv.on('endOfResidence', async req => {
        const {
            legalGround, selectionCriteria = [], excludedLegalEntities = [], retentionStartDate, 
            startTime: endOfBusinessField, conditionSet = [], dataSubjectRole, residenceRuleId, legalEntity
        } = req.data

        LOG.info(`Requested End of residence for legal ground: ${legalGround} with`,
            ` the retention start date ${retentionStartDate} for the data subject role ${dataSubjectRole} and the residence rule ${residenceRuleId}`,
            `The legal entities are: ${legalEntity}. Excluding:`, excludedLegalEntities,  
            `The used field for end of business is: ${endOfBusinessField}`,
            'The conditions are:', conditionSet,
            `The selection criteria are:`, selectionCriteria)

        const legalGroundEntity = _getEntityForLegalGround(legalGround, srv)
        const dsEntities =_getEntitiesForRole(dataSubjectRole, srv)

        if (!dsEntities.some(dsEntity => dsEntity.name === legalGroundEntity.name) && dataSubjectRole !== 'ALL') 
            req.error({
                code: 'ROLE_NOT_FOR_LEGAL_GROUND',
                args: [legalGround, dataSubjectRole],
                status: 400
            })
        
        const where = []
        const eobField = endOfBusinessField || _getEndOfBusinessDateField(legalGroundEntity.elements)
        where.push(
            {ref: [eobField]},
            '<=', 
            {val: dayjs(retentionStartDate).format('YYYY-MM-DDTHH:mm:ssZ')},
        )

        if (legalEntity != 'ALL') {
            const legalField = _getLegalEntityIDField(legalGroundEntity.elements)
            where.push(
                'and',
                {ref: [legalField]},
                '=',
                {val: legalEntity}
            )
        }
        if (excludedLegalEntities && excludedLegalEntities.length !== 0) {
            const legalField = _getLegalEntityIDField(legalGroundEntity.elements)
            let innerWhere = []
            excludedLegalEntities.forEach((e, idx) => {
                if (idx !== 0) innerWhere.push('and')
                innerWhere.push({ref: [legalField]}, '!=', {val: e})
            })
            where.push(
                'and',
                {xpr: innerWhere}
            )
        }

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
        LOG.info(`Requested End of residence for legal ground: ${legalGroundEntity.name}. Constructed where clause:`, where)

        const legalGroundEntities = await SELECT.from(legalGroundEntity).where(where)

        LOG.debug(`Result of end of residence query for legal ground: ${legalGroundEntity.name}:`, legalGroundEntities)

        const legalGroundKeys = Object.keys(legalGroundEntity.keys)
        return {
            residenceRuleId: residenceRuleId,
            legalGroundInstancesArchiveCount: legalGroundEntities.length,
            legalGroundInstances: legalGroundEntities.map(legal_ground => {
                return {
                    keys: legalGroundKeys.reduce((acc, val) => {
                        acc.push({
                            key: val,
                            value: legal_ground[val]
                        })
                        return acc
                    }, []),
                    retentionStartDate: dayjs(legal_ground[eobField]).format('YYYY-MM-DDTHH:mm:ss.SSS')
                }
            }),
            deltatoken: null,
        }
    })

    srv.on('archive', async req => {
        const {
            legalGround, legalGroundArchiveResidenceRules, startTime
        } = req.data
        LOG.info(`Requested archive legal ground: ${legalGround} with`,
            ` the start time field is ${startTime}`,
            `The legal ground archive residence rules are:`, legalGroundArchiveResidenceRules
        )  
        const legalGroundEntity = _getEntityForLegalGround(legalGround, srv)
        let where = []        
        const allLegalGroundInstances = legalGroundArchiveResidenceRules.reduce((acc, val) => {
            val.legalGroundInstances.forEach(instance => {
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
                ...val.legalGroundInstances
            )
            return acc
        }, [])

        //Add check that end of business is crossed
        //Not sure if DRM intends this check - has to be checked with DRM team
        const eobField = startTime || _getEndOfBusinessDateField(legalGroundEntity.elements)
        where = [
            {ref: [eobField]},
            '<',
            {val: `${dayjs().format('YYYY-MM-DD')}`},
            'and',
            {xpr: where}
        ]

        LOG.info(`Requested archive for legal ground: ${legalGroundEntity.name}. Constructed where clause:`, where)

        const legalGroundEntities = await SELECT.from(legalGroundEntity).where(where).columns(_getWholeObjectTree(legalGroundEntity))
        LOG.debug(`Result of archive query for legal ground: ${legalGroundEntity.name}:`, legalGroundEntities)

        let success = 0, failed = 0
        const archivedEntities = []
        for (const legal_ground of allLegalGroundInstances) {
            const legalGround = legalGroundEntities.find(legalGround => {
                let result = true
                for (const key of legal_ground.keys) {
                    if ( !legalGroundEntity.elements[key.key].key ){
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
            if (!legalGround) {
                failed++
                continue
            }
            archivedEntities.push({
                ObjectType: legalGroundEntity.name,     
                ObjectKey: legal_ground.keys[0].value, //TODO: Remove limitation
                ObjectAsBlob: JSON.stringify(legalGround),  
                DataSubjectID: legalGround[_getDataSubjectIDField(legalGroundEntity.elements)],  
                dataSubjectRole: legalGroundEntity['@PersonalData.DataSubjectRole'],
                EndOfRetentionDate: legal_ground.retentionEndDate
            })  
            success++
        }
        if (archivedEntities.length > 0) {
            LOG.info(`Archive request archiving the following entities:`, archivedEntities)
            await INSERT.into(BlockingStore).entries(archivedEntities)
            await Promise.all(_nullForeignKeysOnLegalGround(legalGroundEntity, where)) //TODO: Think about feature flag
            await DELETE.from(legalGroundEntity).where(where)
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