const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('drm')

function serveMasterDataSubjectDeletion(srv, db) {
    srv.before('deleteDataSubjectMaster', async req => {
        if (req.data.purposeStatus === 1) return
    })

    srv.on('deleteDataSubjectMaster', async req => {
        const {
            applicationGroup: applicationGroupName,
            dataSubjectRole,
            dataSubjectId: dataSubjectID,
            deletionDate: maxDeletionDate,
            retentionStartDate,
            purposeStatus
        } = req.data
        req.reply(srv.send({ event: 'deleteDataSubject', data: { applicationGroupName, dataSubjectRole, dataSubjectID, maxDeletionDate }}))
    })
}


module.exports = serveMasterDataSubjectDeletion