const cds = require('@sap/cds'), fs = require("fs"), LOG = cds.log('@sap/cds-dpi'), path = require("path"), xsenv = require('@sap/xsenv'), {constants, requests: {requestClientCredentialsToken}} = require('@sap/xssec'), {executeHttpRequestWithOrigin} = require('@sap-cloud-sdk/http-client')
const { _getLegalEntityIDField, _getDataSubjectIDField, _getEndOfBusinessDateField } = require('./srv/utils')
const dpiSrvGeneration = require('./srv/dpiSrvGeneration')
const fullDPIService = require('./srv/fullDPIDefinitions')
const axios = require('axios')
const DataPrivacyIntegrationBuildPlugin = require('.')
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

cds.on('loaded', async m => {
  const dpiServiceLoader = dpiSrvGeneration() 
  await dpiServiceLoader(m)
})

cds.on('served', async (services)=>{
    if (process.env.NODE_ENV !== 'production' ||cds.env.requires.multitenancy || cds.env.requires["cds.xt.SaasProvisioningService"]) return
    //Call DRM api for registering DRM service instance
    const svc = xsenv.serviceCredentials({ tag: 'drm' });
    if(svc) {
        const { applicationSubscription, uaa } = svc;
        try {
            requestClientCredentialsToken(null, uaa, null, uaa.zoneid, async function(err, token) {
                if (err) LOG.error(err)
                else {
                    const url = applicationSubscription.replace('{tenantId}', uaa.tenantid)
                    const axi = new axios.Axios({})
                    const result = await axi.put(url, undefined, {
                        headers: {
                            Authorization: `Bearer ${token}`, 'Content-Length': 0
                        }
                    })
                    //await executeHttpRequestWithOrigin({url}, {method: 'PUT', headers: {}}, { fetchCsrfToken: false });
                    LOG.info('Registered application on DRM instance. Status:', result.status);
                }
            })

        } catch (e) {
            LOG.error('Error occured when trying to register application on bound DRM instance', e)
        }
    }
});

cds.build?.register?.('cds-dpi', DataPrivacyIntegrationBuildPlugin)