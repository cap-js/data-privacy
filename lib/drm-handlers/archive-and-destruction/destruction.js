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
            
        const legalGroundsToBeDestroyedIDs = await getLegalGroundIDsToBeDeleted(runId, iLMObjectName, selectionCriteria)
       
        if (legalGroundsToBeDestroyedIDs.length > 0) {
            LOG.info(`Deleted the following blocking store entries:`, legalGroundsToBeDestroyedIDs)
            await DELETE.from(BlockingStore).where({ID: {in: legalGroundsToBeDestroyedIDs}})
        }
        req.res.statusCode = 202
        LOG.info(`Result of destruction request: `, "Request intiated succesfully.", "with status code 2",
            `The request ID is ${runId}.`)
        return {
            requestId: runId,
            requestStatusCode: 2, //1 in progress, 4 failed //2 no clue
            requestStatusMessage: "Request completed."
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

        const legalGroundsToBeDestroyedIDs = await getLegalGroundIDsToBeDeleted(runId, iLMObjectName, selectionCriteria)
        req.res.statusCode = 202
        LOG.info(`Result of destruction request: `, "Request intiated succesfully.", "with status code 1",
            `The request ID is ${runId}.`)
        return {
            requestId: runId,
            requestStatusCode: 1,
            requestStatusMessage: "Request intiated succesfully."
        }
    })

    async function getLegalGroundIDsToBeDeleted(runId, iLMObjectName, selectionCriteria) {
        LOG.debug(`Run ${runId}. iLM Object: ${iLMObjectName}. Selection criteria: `, selectionCriteria);
        const iLMObjectEntity = _getEntityForLegalGround(iLMObjectName, srv)
        let whereCon = {ObjectType: iLMObjectEntity.name, EndOfRetentionDate: {'<=': dayjs().format('YYYY-MM-DDTHH:mm:ssZ')}}
        LOG.debug(`Run ${runId}. Where clause for blocking store:`, whereCon)
        const results = await SELECT.from(BlockingStore).where(whereCon)
        LOG.debug(`Run ${runId}. Result of blocking store:`, results)
        const iLMObjectsToBeDestroyedIDs = []
        for(const blockingEntry of results) {
            const archivediLMObject = JSON.parse(blockingEntry.ObjectAsBlob)
            let entryShallBeDeleted = true;
            selectionCriteria.forEach(criteria => {
                if (
                    !(criteria.value !== null && archivediLMObject[criteria.name] == criteria.value) &&
                    !(criteria.valueRange && archivediLMObject[criteria.name] >= criteria.valueRange.from && archivediLMObject[criteria.name] <= criteria.valueRange.to)
                )
                    entryShallBeDeleted = false
            })
            if (entryShallBeDeleted) iLMObjectsToBeDestroyedIDs.push(blockingEntry.ID)
            else LOG.warn(`Run ${runId}. ${iLMObjectName} is not going to be deleted due to selection criteria not matching for blocking entry: ${blockingEntry.ID}`)
        }
        return iLMObjectsToBeDestroyedIDs
    }
}


module.exports = serveDestructionRequests