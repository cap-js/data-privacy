const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('drm')
const { _getEntityForLegalGround } = require('../../utils')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)

function serveDestructionRequests(srv, db) {
    const {BlockingStore} = db.entities('sap.capire.blocking')

    srv.on('destruction', async req => {
        const {
            applicationName,
            runId, iLMObjectName, selectionCriteria = []
        } = req.data

        LOG.info(`Requested destruction for legal ground: ${iLMObjectName} and app ${applicationName} with`,
            ` the request ID ${runId}.`,
            `The selection criteria are:`, selectionCriteria)
            
        const legalGroundsToBeDestroyedIDs = await getLegalGroundIDsToBeDeleted(req.data)
       
        if (legalGroundsToBeDestroyedIDs.length > 0) {
            LOG.info(`Deleted the following blocking store entries:`, legalGroundsToBeDestroyedIDs)
            await DELETE.from(BlockingStore).where({ID: {in: legalGroundsToBeDestroyedIDs}})
        }
        req.res.statusCode = 202
        LOG.info(`Result of destruction request: `, "Request intiated succesfully.", "with status code 1",
            `The request ID is ${runId}.`)
        return {
            requestId: runId,
            requestStatusCode: 1,
            requestStatusMessage: "Request intiated succesfully."
        }
    })

    srv.on('simulateDestruction', async req => {
        const {
            applicationName,
            runId, iLMObjectName, selectionCriteria = []
        } = req.data

        LOG.info(`Requested simulateDestruction for legal ground: ${iLMObjectName} and app ${applicationName} with`,
            ` the request ID ${runId}.`,
            `The selection criteria are:`, selectionCriteria)

        const legalGroundsToBeDestroyedIDs = await getLegalGroundIDsToBeDeleted(req.data)
        req.res.statusCode = 202
        LOG.info(`Result of destruction request: `, "Request intiated succesfully.", "with status code 1",
            `The request ID is ${runId}.`)
        return {
            requestId: runId,
            requestStatusCode: 1,
            requestStatusMessage: "Request intiated succesfully."
        }
    })

    async function getLegalGroundIDsToBeDeleted({
        runId, iLMObjectName, selectionCriteria = []
    }) {
        const iLMObjectEntity = _getEntityForLegalGround(iLMObjectName, srv)
        let whereCon = {ObjectType: iLMObjectEntity.name, EndOfRetentionDate: {'<=': dayjs().format('YYYY-MM-DDTHH:mm:ssZ')}}
        LOG.debug(`Run ${runId}. Where clause for blocking store:`, whereCon)
        const results = await SELECT.from(BlockingStore).where(whereCon)
        LOG.debug(`Run ${runId}. Result of blocking store:`, results)
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