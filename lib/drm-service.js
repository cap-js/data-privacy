const cds = require('@sap/cds'), dayjs = require('dayjs')
const express = require('express')
const path = require('path')
const serveStatic = require('serve-static')
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter')
const serveArchiveRequests = require('./drm-handlers/archive-and-destruction/archive')
const serveDestructionRequests = require('./drm-handlers/archive-and-destruction/destruction')
const serveDataSubjectDeletion = require('./drm-handlers/data-subject-deletion/data-subject-deletion')
const serveDataSubjectEligibleForDeletion = require('./drm-handlers/data-subject-deletion/data-subject-eligible-for-deletion')
const serveLegalEntitiesAndVHs = require('./drm-handlers/data-subject-deletion/legal-entities-and-condition-vh')
const serveMasterDataSubjectDeletion = require('./drm-handlers/data-subject-deletion/master-data-subject-deletion')
const serveLegalGrounds = require('./drm-handlers/transactional-data-discovery')
dayjs.extend(isSameOrAfter)

module.exports = async srv => {
    
    const db = await cds.connect.to('db')

    serveDataSubjectDeletion(srv, db)
    serveMasterDataSubjectDeletion(srv, db)
    serveDataSubjectEligibleForDeletion(srv, db)
    serveLegalEntitiesAndVHs(srv, db)
    
    serveLegalGrounds(srv, db)

    serveArchiveRequests(srv, db)
    serveDestructionRequests(srv, db)

    //Translation handling
        //- based on cds.env.i18n.languages the offered languages - all => all supported drm languages
        //drm crashes if keys are provided but no text is provided
        //In future: Merge logic that provides unified bundle for drm
        //cds.i18n.drm_folder - if not provided cds.evn.i18n.folders[0]
        //translations deactivated when cds.env.i18n.languages === 'none'
    if (cds.env.i18n.languages !== 'none') {
        cds.on('served', async () => {
            cds.app.use('/drm-i18n', serveStatic(path.join(__dirname, '../',cds.env.i18n.drm_folder || cds.env.i18n.folders[0])))
        });
    }
} 