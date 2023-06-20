const cds = require('@sap/cds'), fs = require("fs"), path = require("path")

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
        - Align on common DRM-API set we would offer
        - Remove conditionFieldValues from final service
        - Implement object store from HANA
        - Concept for distributed services
            - External services: How to consider? Just change the URL part in transactional-data-discovery?
            - How to consider applicationGroups concept from DRM

*/
//const test = fs.readFileSync(path.join(__dirname, '/srv/drm-service.cds'))
/* cds.load(path.join(__dirname, '/srv/drm-service.cds')).then((result) => {
    console.log(result)
    cds.compile(result)
}) */
//const drmService_model = cds.compile (test)

const drmEntities = {}

cds.on('loaded', m => {
    
    for (let each in m.definitions) {
        let def = m.definitions[each]
        //Scenario 2 - only add actions
        if (!def.query && !def.projection && def.kind === 'entity' && def['@PersonalData.EntitySemantics']) {
            const newEntityName = each.split('.')[each.split('.').length-1]
            drmEntities[newEntityName] = {}
            Object.assign(drmEntities[newEntityName], def)
            drmEntities[newEntityName].name = `DRMService.${newEntityName}`
            drmEntities[newEntityName].projection = {from: {ref: [each]}}
            drmEntities[newEntityName].query = SELECT.from(each)
            drmEntities[newEntityName].__isDraftEnabled = false
        }
    }

    

    
})

//Scenario 1 - add everything automatically
cds.on('served', (services)=>{
    let drmServiceExists = false
    for (let each in services) {
        let def = services[each]
        //Scenario 2 - only add actions
        if (!def['@cds.provided'] && (each === 'DRMService' || (def['@path'] && (def['@path'] === '/drm' || def['@path'] === 'drm')))) {
            drmServiceExists = true

        }
    }
    if (!drmServiceExists) {
        cds.serve('DRMService').from('./srv/drm-service.cds')
        Object.assign(cds.services.DRMService.entities, drmEntities)
    }
})
