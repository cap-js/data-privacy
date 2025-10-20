const cds = require('@sap/cds');
const getDPIentities = require('../lib/model/get-dpi-entities');
const LOG = cds.log('data-privacy-retention')

module.exports = class DPIRetentionService extends cds.ApplicationService {
  async init() {

    //Attaching iLMObjects to model to make sure that extensions are also considered in MTX scenario
    const result = getDPIentities(cds.model, this);
    cds.model._iLMObjects = result.iLMObjects;
    //Attached to model because keys can vary in extensibility scenarios
    cds.model._drm_i18nKeys = [...new Set(result.usedI18Nkeys)];

    const {iLMObjects} = this.entities     

    for (const handler of result.handlersToRegister) {
      this.entities[handler.name] = handler.entity;
      this.on(handler.event, handler.entity, handler.handler);
      cds.model.definitions[`${this.name}.${handler.name}`] = handler.entity;
    }
    //Registration inside the service means it only triggers for compiles after the first one, e.g. for MTX scenarios
    //This is done to properly register the value help entities within the model
    //Only compile can't be done because the model availale within compile does not yet include all relevant VH entities
    cds.on('compile.for.runtime', (model) => {
      const DPIRetentionService = model.definitions.find(n => {
        let def = model.definitions[n]
        if (
          def.kind === 'service' && 
          !def['@cds.provided'] && (n === 'DPIRetentionService' || (def['@path'] && (def['@path'] === '/drm' || def['@path'] === 'drm')))
        )
          return n;
      })
      for (const handler of result.handlersToRegister) {
        model.definitions[`${DPIRetentionService}.${handler.name}`] = handler.entity;
      }
    })

    const buildBaseUrl = (req) => {
      let url = ''
      if (process.env.NODE_ENV === 'production') url += 'https://'
      url += req._req ? req._req.get('host') : req.req.get('host')
      return url
    }
    this.on('READ', iLMObjects, async req => {
      const model = cds.context.model ?? cds.model
      if (!model._iLMObjects) {
        const result = getDPIentities(model, this);
        model._iLMObjects = result.iLMObjects;
      }
      if (model._iLMObjects[0].iLMObjectBaseURL === '~{srv-api/srv-url}') {
        const baseUrl = buildBaseUrl(req)
        for (const iLMObject of model._iLMObjects) {
          iLMObject.iLMObjectBaseURL = baseUrl
        }
      }
      LOG.debug('Transactional data discovery:', model._iLMObjects)
      req.reply(model._iLMObjects)
    })

    this.on('READ', this.entities['i18n-files'], async (req) => {
      const model = cds.context.model ?? cds.model;
      if (!model._drm_i18nKeys) {
        const result = getDPIentities(model, this);
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
}
