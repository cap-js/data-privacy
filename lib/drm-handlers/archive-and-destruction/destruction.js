const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('drm')
const { _getEntityForLegalGround } = require('../../utils')


function serveDestructionRequests(srv, db) {
    const {BlockingStore} = db.entities('sap.capire.blocking')

    srv.on('destruction', async req => {
        const {
            requestId, legalGroundName:legalGround, selectionCriteria = []
        } = req.data

        LOG.info(`Requested destruction for legal ground: ${legalGround} with`,
            ` the request ID ${requestId}.`,
            `The selection criteria are:`, selectionCriteria)
            
        const legalGroundsToBeDestroyedIDs = await getLegalGroundIDsToBeDeleted(req.data)
       
        if (legalGroundsToBeDestroyedIDs.length > 0) {
            LOG.info(`Deleted the following blocking store entries:`, legalGroundsToBeDestroyedIDs)
            await DELETE.from(BlockingStore).where({ID: {in: legalGroundsToBeDestroyedIDs}})
        }
        req.res.statusCode = 202
        LOG.info(`Result of destruction request: `, "Request intiated succesfully.", "with status code 1",
            `The request ID is ${requestId}.`)
        return {
            requestId: requestId,
            requestStatusCode: 1,
            requestStatusMessage: "Request intiated succesfully."
        }
    })

    srv.on('simulateDestruction', async req => {
        const {
            requestId, legalGroundName:legalGround, selectionCriteria = []
        } = req.data

        LOG.info(`Requested simulateDestruction for legal ground: ${legalGround} with`,
            ` the request ID ${requestId}.`,
            `The selection criteria are:`, selectionCriteria)

        const legalGroundsToBeDestroyedIDs = await getLegalGroundIDsToBeDeleted(req.data)
        req.res.statusCode = 202
        LOG.info(`Result of destruction request: `, "Request intiated succesfully.", "with status code 1",
            `The request ID is ${requestId}.`)
        return {
            requestId: requestId,
            requestStatusCode: 1,
            requestStatusMessage: "Request intiated succesfully."
        }
    })

    async function getLegalGroundIDsToBeDeleted({
        requestId, legalGroundName:legalGround, selectionCriteria = []
    }) {
        const legalGroundEntity = _getEntityForLegalGround(legalGround, srv)
        let whereCon = {ObjectType: legalGroundEntity.name, EndOfRetentionDate: {'<=': dayjs().format('YYYY-MM-DDTHH:mm:ssZ')}}
        LOG.debug(`Requested ID ${requestId}. Where clause for blocking store:`, whereCon)
        const results = await SELECT.from(BlockingStore).where(whereCon)
        LOG.debug(`Requested ID ${requestId}. Result of blocking store:`, results)
        const legalGroundsToBeDestroyedIDs = []
        for(const legal_ground of results) {
            const archivedLegalGround = JSON.parse(legal_ground.ObjectAsBlob)
            selectionCriteria.forEach(criteria => {
                if (
                    (criteria.value !== null && archivedLegalGround[criteria.name] === criteria.value) || 
                    (criteria.valueRange && archivedLegalGround[criteria.name] >= criteria.valueRange.from && archivedLegalGround[criteria.name] <= criteria.valueRange.to)
                )
                    legalGroundsToBeDestroyedIDs.push(legal_ground.ID)
            })
        }
        return legalGroundsToBeDestroyedIDs
    }
}


module.exports = serveDestructionRequests