const cds = require('@sap/cds'), fs = require("fs"), LOG = cds.log('@sap/cds-dpi'), path = require("path"), xsenv = require('@sap/xsenv'), {constants, requests: {requestClientCredentialsToken}} = require('@sap/xssec'), {executeHttpRequestWithOrigin} = require('@sap-cloud-sdk/http-client')
const { _getLegalEntityIDField, _getDataSubjectIDField, _getEndOfBusinessDateField } = require('./lib/utils')
const dpiSrvGeneration = require('./lib/dpiSrvGeneration')
const fullDPIService = require('./lib/dpicsn.json').definitions
const axios = require('axios')

/*
    Logic for drm addition
    General plan: 3 step tier

    1. Fully automated - drm including all actions + entities is added automatically
        -> When no DRMService / service with path drm is defined for the app, but PersonalData annotations are in the data model
        -> Adding the service + all actions for DRM
        -> Entities with PersonalData annotated are added to the service

    2. Partially automated - DRM service is defined by the app and cds only adds actions
        -> DRMService / service with path drm  is defined. We only add all actions + implementations to the service
        -> Offer setting: autoComplete entities: When activated all entities with the annotations which are not added 
            explicitly are added automatically. Done so that if only one entity has to be overridden, it works fine.

    3. Manual implementation - App does everything and we do not interviene
        -> If an action is specified in the DRMService we do not add our handler for it
        -> We offer utils api to interact with blocking store + helper functions to handle requests


    //TODO:
        - Generate i18n folder for drm automatically
        - Fully implement three tier config - but wait for feedback of first testers
        - Align on common DRM-API set we would offer
        - Implement object store from HANA
        - Concept for distributed services
            - External services: How to consider? Just change the URL part in transactional-data-discovery?
            - How to consider applicationGroups concept from DRM

*/
if (process.env.NODE_ENV !== 'production') {
    cds.on('loaded', m => {
        const dpiServiceLoader = dpiSrvGeneration();
        dpiServiceLoader(m);
    });
}

cds.build?.register?.('data-privacy', class DPIPlugin extends cds.build.Plugin {
  static taskDefaults = { src: cds.env.folders.srv }
  static hasTask() {
    return true;
  }
  init() {
    this.task.dest = path.join(this.task.dest, 'srv');
  }
  async build() {
    const model = await this.model();
    if (!model) return;
    await this.copy(path.join(__dirname, 'lib/drm-service.js')).to('drm-service.js');
  }
})