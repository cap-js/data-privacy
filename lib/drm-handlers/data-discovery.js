const { getDPIentities } = require('../model/get-dpi-entities')

const cds = require('@sap/cds'), LOG = cds.log('data-privacy')

/**
 * 
 * @param {*} srv 
 */
module.exports = function serveDataDiscovery(srv, handlers) {
    const {iLMObjects} = srv.entities     

    for (const handler of handlers) {
      srv.entities[handler.name] = handler.entity;
      srv.on(handler.event, handler.entity, handler.handler);
      cds.model.definitions[`${srv.name ?? 'DRMService'}.${handler.name}`] = handler.entity;
    }
    //Registration inside the service means it only triggers for compiles after the first one, e.g. for MTX scenarios
    //This is done to properly register the value help entities within the model
    //Only compile can't be done because the model availale within compile does not yet include all relevant VH entities
    cds.on('compile.for.runtime', (model) => {
      const DRMService = model.definitions.find(n => {
        let def = model.definitions[n]
        if (
          def.kind === 'service' && 
          !def['@cds.provided'] && (n === 'DRMService' || (def['@path'] && (def['@path'] === '/drm' || def['@path'] === 'drm')))
        )
          return n;
      })
      for (const handler of handlers) {
        model.definitions[`${DRMService ?? 'DRMService'}.${handler.name}`] = handler.entity;
      }
    })

    const buildBaseUrl = (req) => {
      let url = ''
      if (process.env.NODE_ENV === 'production') url += 'https://'
      url += req._req ? req._req.get('host') : req.req.get('host')
      return url
    }
    srv.on('READ', iLMObjects, async req => {
      const model = cds.context.model ?? cds.model
      if (!model._iLMObjects) {
        const result = getDPIentities(model, srv);
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
}