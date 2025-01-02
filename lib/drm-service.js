const cds = require('@sap/cds'), dayjs = require('dayjs')
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter')
const serveArchiveRequests = require('./drm-handlers/archive-and-destruction/archive')
const serveDestructionRequests = require('./drm-handlers/archive-and-destruction/destruction')
const serveDataSubjectDeletion = require('./drm-handlers/data-subject-deletion/data-subject-deletion')
const serveDataSubjectEligibleForDeletion = require('./drm-handlers/data-subject-deletion/data-subject-eligible-for-deletion')
const serveDataDiscovery = require('./drm-handlers/data-discovery')
const { getDPIentities } = require('./model/get-dpi-entities')
dayjs.extend(isSameOrAfter)

module.exports = async srv => {
    
    const db = await cds.connect.to('db')

    //Attaching iLMObjects to model to make sure that extensions are also considered in MTX scenario
    const result = getDPIentities(cds.model, srv);
    cds.model._iLMObjects = result.iLMObjects;
    //Attached to model because keys can vary in extensibility scenarios
    cds.model._drm_i18nKeys = [...new Set(result.usedI18Nkeys)];

    serveDataSubjectDeletion(srv, db)
    serveDataSubjectEligibleForDeletion(srv, db)
    
    serveDataDiscovery(srv, result.handlersToRegister)

    serveArchiveRequests(srv, db)
    serveDestructionRequests(srv, db)

    srv.on('READ', srv.entities['i18n-files'], async (req) => {
        const model = cds.context.model ?? cds.model;
        if (!model._drm_i18nKeys) {
            const result = getDPIentities(model, srv);
            model._drm_i18nKeys = [...new Set(result.usedI18Nkeys)];
        }
        const getFile = (language) => {
            let file = ''
            model._drm_i18nKeys.forEach(key => {
                const translation = cds.i18n.labels.for(key, language);
                file += `${key}=${translation}\n`;
            });
            return file;
        }
        let file = ''
        if (req.data.file.startsWith('i18n_en')) {
            file = getFile('en');
        } else if (req.data.file.startsWith('i18n_de')) {
            file = getFile('de');
        } else if (req.data.file.startsWith('i18n_fr')) {
            file = getFile('fr');
        } else if (req.data.file.startsWith('i18n_es')) {
            file = getFile('es');
        } else {
            file = getFile('en');
        }
        req.res.set('Content-Type', 'text/plain');
        req.res.set('Content-disposition', `attachment; filename=${req.data.file ?? 'i18n.properties'}`);
        req.res.status(200);
        req.res.end(file);
    });
} 