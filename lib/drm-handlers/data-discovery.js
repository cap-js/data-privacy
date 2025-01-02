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
    }

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