const { BuildTaskHandler, BuildError } = require('@sap/cds/bin/build'), { WARNING, ERROR, INFO } = BuildTaskHandler,
    MTA_YAML = 'mta.yaml';
const cds = require('@sap/cds')
const path = require('path')
const LOG = cds.log('@sap/cds-dpi')
const yaml = require('js-yaml');
const fs = require('fs-extra')
const { translationUtils, _getLegalEntity } = require('./srv/utils');
const dpiSrvGeneration = require('./srv/dpiSrvGeneration');
const UTF_8 = 'utf-8'

const DRMScope = 'DataRetentionManagerUser'
const PDMScope = 'PersonalDataManagerUser'
/**
 * The custom build task is used to generate the 
 * drm config into the mta.yaml file
 */
module.exports = class NodeCfWithDPIModuleBuilder extends BuildTaskHandler {

    getPDMTemplate() {
        return {
            name: "pdm",
            type: "org.cloudfoundry.managed-service",
            parameters: this.getPDMParameterTemplate()
        }
    }

    getPDMParameterTemplate() {
        return {
            service: "personal-data-manager-service",
            "service-name": "pdm",
            "service-plan": "standard",
            config: this.getPDMParameterConfigTemplate()
        }
    }

    getPDMParameterConfigTemplate() {
        return {
            fullyQualifiedApplicationName: this.service.name,
            appConsentServiceEnabled: false,
            "xs-security": {
              xsappname: this.xsuaa.parameters.config.xsappname,
              authorities: ["$ACCEPT_GRANTED_AUTHORITIES",],
            }
        }
    }

    getPDMConfig() {
        return {
            fullyQualifiedApplicationName: this.service.name,
            applicationURL: '${default-url}',
            fullyQualifiedModuleName: this.service.name,
            applicationTitle: 'CAP application',
            cacheControl: 'no-cache',
            endPoints: [{
                type: 'odatav4',
                serviceName: this.service.name,
                serviceTitle: 'GDPR CAP PDM Service',
                serviceURI: 'pdm',
                hasGdprV4Annotations: true,
                appPaginationEnabled: true,
            }]
        }
    }

    getDRMTemplate() {
        return {
            name: "drm",
            type: "org.cloudfoundry.managed-service",
            parameters: this.getDRMParameterTemplate()
        }
    }

    getDRMParameterTemplate() {
        return {
            service: "retention-manager",
            "service-name": "drm",
            "service-plan": "standard",
            config: this.getDRMParameterConfigTemplate()
        }
    }

    getDRMParameterConfigTemplate() {
        return {
            "xs-security": {
              xsappname: this.xsuaa.parameters.config.xsappname,
              authorities: ["$ACCEPT_GRANTED_AUTHORITIES",],
            }
        }
    }

    getRetentionConfigs(csn, alternativeURL) {
        const { translate } = translationUtils(csn, {isBuild: true})
        const dataSubjects = []
        for (let each in csn.definitions) {
            let def = csn.definitions[each]
            if (!def.query && !def.projection && def.kind === 'entity' && def['@PersonalData.EntitySemantics'] === 'DataSubject') {
                const entityName = each.split('.')[each.split('.').length-1],
                    role = def['@PersonalData.DataSubjectRole']
                if (dataSubjects.some(ds => ds.dataSubjectRole === role)) {
                    this.pushMessage(`Data subject ${role} already defined. Skipping entity ${entityName}`, WARNING)
                    continue
                }
                const dataSubject = {
                    dataSubjectRole: role,
                    dataSubjectDescription: translate(def['@Core.Description'] || entityName),
                    dataSubjectDescriptionKey: def['@Core.Description'] || entityName,
                    dataSubjectBaseURL: alternativeURL || "${default-url}",
                    dataSubjectInformationFilterEnabled: true,
                    dataSubjectInformationEndPoint: "/drm/dataSubjectInformation",
                    dataSubjectDeletionEndPoint: "/drm/deleteDataSubject",
                    dataSubjectsDestroyingEndPoint: "/drm/destroyDataSubjects",
                    legalGroundDiscovery: true,
                    legalGroundDiscoveryEndPoint: `/drm/legalGrounds/${role}`,
                  }
                const legalEntity = def.elements[_getLegalEntity(def.elements)]?._target,
                  legalEntityAssoc = def.elements[_getLegalEntity(def.elements)]
                const legalEntityName = legalEntity.name.split('.')[legalEntity.name.split('.').length-1]
                if (!legalEntity) {
                    this.pushMessage(`No legal entity association in entity ${entityName}. Due to that no legalEntity property added to DRM retention config for it`, WARNING)
                } else {
                    dataSubject.legalEntity = {
                        legalEntity: translate(legalEntityAssoc["@Common.Label"] || legalEntity['@UI.HeaderInfo.TypeName'] || legalEntityName),
                        legalEntityDescription: translate(legalEntity["@Core.Description"] || legalEntityName),
                        legalEntityDescriptionKey: `DRM_LEGAL_ENTITY_${String(role).toUpperCase()}`,
                        legalEntityValueHelpEndPoint: `/drm/legalEntities`,
                    }
                }
                dataSubjects.push(dataSubject)
            }
        }
        return {
            applicationGroupName: this.service.name, //REVISIT: Probably not the correct property - maybe just as fallback
            applicationGroupDescription: this.service.description || this.service.name,
            applicationGroupDescriptionKey: 'DRM_APPLICATION_GROUP_DESCRIPTON',
            applicationGroupBaseURL: alternativeURL || "${default-url}",
            simulationSupportedForDestruction: true,
            //applicationGroupType: ["TransactionMaster"], //DataSubjectMaster <- maybe does not work, DataSubjectMasterApplication, ConsentMaster is also possible, but not sure when to use
            dataSubjects: dataSubjects,
        }
    }

    async init() {
        this._cds = cds
        this.mta = await _getMta(LOG)
        this.ID = this.mta ? this.mta.ID.split('.')[this.mta.ID.split('.').length-1] : null
        this.service = this.mta.modules.find(m => m.name === `${this.ID}-srv`);
        this.xsuaa = this.mta.resources.find(m => m.parameters.service === `xsuaa` && this.service.requires.some(r => r.name === m.name));
        this.drm = this.mta.resources.find(m => m.parameters.service === `retention-manager`);
        this.service_drm_binding = this.service.requires.find(r => r.name === this.drm?.name)
        this.pdm = this.mta.resources.find(m => m.parameters.service === `personal-data-manager-service`);
        this.service_pdm_binding = this.service.requires.find(r => r.name === this.pdm?.name)
    }

    async clean() {}

    async build() {
        const csn = cds.reflect(await this.model())
        const dpiServiceLoader = dpiSrvGeneration() 
        await dpiServiceLoader(csn)
        this.checkPrivacyAnnotations(csn)
        this.annotationHelper(csn)

        if (!this.mta) {
            this.pushMessage('No mta.yaml descriptor found to which the DRM configuration could have been added', WARNING)
            return
        }
        if (!this.service) {
            this.pushMessage('No CAP service module found', WARNING)
            return
        }
        if (!this.xsuaa) {
            this.pushMessage('No xsuaa resource found which is bound against CAP service', WARNING)
            return
        }
        
        //Ensure that drm service exists as resource
        if (!this.drm) {
            this.pushMessage('No drm service found... Adding one to the mta', WARNING)
            this.drm = this.getDRMTemplate()
            this.mta.resources.push(this.drm)
        }
        if (!this.drm.parameters) {
            this.pushMessage('Added parameters to drm service as they were missing', INFO)
            this.drm.parameters = this.getDRMParameterTemplate()
        }

        if (!this.drm.parameters.config) {
            this.pushMessage('Added parameter config to drm service as it was missing', INFO)
            this.drm.parameters.config = this.getDRMParameterConfigTemplate()
        }

        //Ensure that service-name is set
        if (!this.drm.parameters['service-name']) {
            this.pushMessage('Added property service-name to drm service in mta.yaml as it is required for granting access to the service', INFO)
            this.drm.parameters['service-name'] = this.drm.name
        }
        //Ensure that xs security properties are set on instance
        if (!this.drm.parameters.config['xs-security']) {
            this.pushMessage('Added xs-security part to drm service in mta.yaml as it is required for granting access to the service', INFO)
            this.drm.parameters.config['xs-security'] = this.getDRMParameterConfigTemplate()['xs-security']
        }
        
        if (!this.drm.requires.some(r => r.name === 'srv-api'))
            this.drm.requires.push({name: 'srv-api'})

        this.drm.parameters.config["retention-configs"] = this.getRetentionConfigs(csn, '~{srv-api/srv-url}')

        //Ensure that scope for DRM is added to XSUAA service that it already exist - here ensure that grant to app - name of app is correct
        if (!this.xsuaa.parameters.config.scopes || !this.xsuaa.parameters.config.scopes.some(scope => scope.name === `$XSAPPNAME.${DRMScope}`)) {
            this.pushMessage('Added scope for DRM endpoint to XSUAA service so that it is granted to DRM service', INFO)
            if (!Array.isArray(this.xsuaa.parameters.config.scopes)) this.xsuaa.parameters.config.scopes = []
            this.xsuaa.parameters.config.scopes.push({
                name: "$XSAPPNAME.DataRetentionManagerUser",
                description: "Technial scope to restrict access to DRM endpoint of CAP",
                "grant-as-authority-to-apps": [
                  `$XSSERVICENAME(${this.drm.parameters['service-name']})`,
                ],
            })
        }

        //Ensure that the grant as authority to app service name is correct - else update will fail
        const drmScope = this.xsuaa.parameters.config.scopes.find(scope => scope.name === `$XSAPPNAME.${DRMScope}`)
        if (drmScope && (!Array.isArray(drmScope) || drmScope['grant-as-authority-to-apps'][0] !== `$XSSERVICENAME(${this.drm.parameters['service-name']})`)) {
            this.pushMessage('Changed grant-as-authority-to-apps DRM scope service name to actual service name ', INFO)
            drmScope['grant-as-authority-to-apps'] = [`$XSSERVICENAME(${this.drm.parameters['service-name']})`]
        }

        //Ensure that CAP app requires drm service
        if(!this.service_drm_binding) {
            this.service_drm_binding = {
                name: this.drm.name,
            }
        }

        //Ensure that pdm service exists as resource
        if (!this.pdm) {
            this.pushMessage('No pdm service found... Adding one to the mta', WARNING)
            this.pdm = this.getPDMTemplate()
            this.mta.resources.push(this.pdm)
        }
        if (!this.pdm.parameters) {
            this.pushMessage('Added parameters to pdm service as they were missing', INFO)
            this.pdm.parameters = this.getPDMParameterTemplate()
        }

        if (!this.pdm.parameters.config) {
            this.pushMessage('Added parameter config to pdm service as it was missing', INFO)
            this.pdm.parameters.config = this.getPDMParameterConfigTemplate()
        }

        //Ensure that service-name is set
        if (!this.pdm.parameters['service-name']) {
            this.pushMessage('Added property service-name to pdm service in mta.yaml as it is required for granting access to the service', INFO)
            this.pdm.parameters['service-name'] = this.pdm.name
        }
        //Ensure that xs security properties are set on instance
        if (!this.pdm.parameters.config['xs-security']) {
            this.pushMessage('Added xs-security part to pdm service in mta.yaml as it is required for granting access to the service', INFO)
            this.pdm.parameters.config['xs-security'] = this.getPDMParameterConfigTemplate()['xs-security']
        }
        //Ensure that fullyQualifiedApplicationName is set in pdm config - if not set it to CAP module name
        if (!this.pdm.parameters.config.fullyQualifiedApplicationName) {
            this.pushMessage('Added property fullyQualifiedApplicationName to pdm service in mta.yaml as it is required for creating the service', INFO)
            this.pdm.parameters.config.fullyQualifiedApplicationName = this.service.name
        }

        //Ensure that scope for PDM is added to XSUAA service that it already exist - here ensure that grant to app - name of app is correct
        if (!this.xsuaa.parameters.config.scopes || !this.xsuaa.parameters.config.scopes.some(scope => scope.name === `$XSAPPNAME.${PDMScope}`)) {
            this.pushMessage('Added scope for PDM endpoint to XSUAA service so that it is granted to PDM service', INFO)
            if (!Array.isArray(this.xsuaa.parameters.config.scopes)) this.xsuaa.parameters.config.scopes = []
            this.xsuaa.parameters.config.scopes.push({
                name: "$XSAPPNAME.DataRetentionManagerUser",
                description: "Technial scope to restrict access to PDM endpoint of CAP",
                "grant-as-authority-to-apps": [
                  `$XSSERVICENAME(${this.pdm.parameters['service-name']})`,
                ],
            })
        }
        //Ensure that the grant as authority to app service name is correct - else update will fail
        const pdmScope = this.xsuaa.parameters.config.scopes.find(scope => scope.name === `$XSAPPNAME.${PDMScope}`)
        if (pdmScope && (!Array.isArray(pdmScope) && pdmScope['grant-as-authority-to-apps'][0] !== `$XSSERVICENAME(${this.pdm.parameters['service-name']})`)) {
            this.pushMessage('Changed grant-as-authority-to-apps PDM scope service name to actual service name ', INFO)
            pdmScope['grant-as-authority-to-apps'] = [`$XSSERVICENAME(${this.pdm.parameters['service-name']})`]
        }

        //Ensure that CAP app requires pdm service
        if(!this.service_pdm_binding) {
            this.service_pdm_binding = {
                name: this.pdm.name,
                parameters: {
                  config: this.getPDMConfig(csn)
                }
            }
        }

        //Ensrue that retention configs are set
        if (!this.service_pdm_binding.parameters) {
            this.service_pdm_binding.parameters = {config: this.getPDMConfig(csn)}
        } else {
            this.service_pdm_binding.parameters.config = this.getPDMConfig(csn)
        }


        //Ensure that DRM is added to SaaS dependencies in case of mtx
        if (cds.env.requires.multitenancy || cds.env.requires["cds.xt.SaasProvisioningService"]) {
            if (!this.service.properties) this.service.properties = {}
            if (!this.service.properties.CDS_CONFIG) this.service.properties.CDS_CONFIG = {}
            if (!this.service.properties.CDS_CONFIG.requires) this.service.properties.CDS_CONFIG.requires = {}
            if (!this.service.properties.CDS_CONFIG.requires["cds.xt.SaasProvisioningService"]) 
                this.service.properties.CDS_CONFIG.requires["cds.xt.SaasProvisioningService"] = {}
            if (!this.service.properties.CDS_CONFIG.requires["cds.xt.SaasProvisioningService"].dependencies) 
                this.service.properties.CDS_CONFIG.requires["cds.xt.SaasProvisioningService"].dependencies = [this.drm.parameters.config['xs-security'].xsappname]
            else if(!this.service.properties.CDS_CONFIG.requires["cds.xt.SaasProvisioningService"].dependencies.some(d => d === this.drm.parameters.config['xs-security'].xsappname)) 
                this.service.properties.CDS_CONFIG.requires["cds.xt.SaasProvisioningService"].dependencies.push(this.drm.parameters.config['xs-security'].xsappname)
        }
        
        //Write back to cds file
        const writes = []
        await fs.writeFile(MTA_YAML, yaml.dump(this.mta)); //Dont include in promise.all - because when that is interrupted mta is empty
        this._result = {csn}
        writes.push(this.write(cds.compile(csn).to.json()).to('srv/srv/csn-dpi.json'))

        //Generate hdb artefacts for DRM und PDM service
        const all = cds.compile.to.hdbtable (csn)
        for (let [src,{file}] of all) {
            if (file.match(/DRMService\./g) || file.match(/PDMService\./g) || file.match(/\.BlockingStore/g))
                writes.push(this.write(src).to(`db/src/gen/${file}`))
        }
        await Promise.all(writes)
    }

    /**
     * Some OData annotations mean the same thing. To avoid situations, where devs have to annotate the entity multiple times for the same meaning, 
     * the annotation helper ensures, that all kinds of a meaning are covered
     * @param {*} m 
     */
    annotationHelper(m) {
        const isPersonal = (element) => element['@PersonalData.IsPotentiallyPersonal'] = true
        const isSensitive = (element) => element['@PersonalData.IsPotentiallySensitive'] = true
        const annoIsPersonal = (def, annotation, altForWrite) => {
            altForWrite = altForWrite || def
            if (def[annotation] && altForWrite.elements[def[annotation]['=']]) {
                isPersonal(altForWrite.elements[def[annotation]['=']])
            }
        }
        const annoIsSensitive = (def, annotation, altForWrite) => {
            altForWrite = altForWrite || def
            if (def[annotation] && altForWrite.elements[def[annotation]['=']]) {
                isSensitive(altForWrite.elements[def[annotation]['=']])
            }
        }
        const nameProperties = {surname: 1, given: 1, additional: 1, prefix: 1, suffix: 1},
            addressProperties = {building: 1, street: 1, district: 1, locality: 1, region: 1, code: 1, country: 1, pobox: 1, ext: 1, careof: 1}
        for (let each in m.definitions) {
            let def = m.definitions[each]
            for (let ele in def.elements) {
                const eleDef = def.elements[ele]
                if (eleDef['@Communication.IsEmailAddress']) isPersonal(eleDef)
                else if (eleDef['@Communication.IsPhoneNumber']) isPersonal(eleDef)
            }
            for (const name in nameProperties) {
                annoIsPersonal(def, `@Communication.Contact.n.${nameProperties}`)
            }
            annoIsPersonal(def, '@Communication.Contact.nickname')
            annoIsSensitive(def, '@Communication.Contact.bday')
            annoIsSensitive(def, '@Communication.Contact.anniversary')
            annoIsSensitive(def, '@Communication.Contact.gender')
            annoIsSensitive(def, '@Communication.Contact.photo')
            annoIsPersonal(def, '@Communication.Contact.title')
            if (def['@Communication.Contact.adr'])
                for (const adr of def['@Communication.Contact.adr']) {
                    for (const a in addressProperties)
                        annoIsPersonal(adr, a, def)
                }
            if (def['@Communication.Contact.tel'])
            for (const tel of def['@Communication.Contact.tel']) {
                annoIsPersonal(tel, `uri`, def)
                if (tel.uri['=']) def.elements[tel.uri['=']]['@Communication.IsPhoneNumber'] = true
            }
            if (def['@Communication.Contact.email'])
            for (const email of def['@Communication.Contact.email']) {
                annoIsPersonal(email, `address`, def)
                if (email.address['=']) def.elements[email.address['=']]['@Communication.IsEmailAddress'] = true
            }
            if (def['@Communication.Address'])
            for (const adr of def['@Communication.Address']) {
                for (const a in addressProperties)
                    annoIsPersonal(adr, a, def)
            }
        }
    }

    checkPrivacyAnnotations(m) {
        const dataSubjects = [], legalGrounds = []
        const rootHasNotAnnotation = (entity, annotation) => {
            if (!entity.query && !entity[annotation]) return true
            else if (entity.query) return rootHasNotAnnotation(m.definitions[entity.query._target.name], annotation)
            return false
        }
        for (let each in m.definitions) {
            let def = m.definitions[each]
            if (!def.query && def.kind === 'entity' && def['@PersonalData.EntitySemantics'] && !each.match(/DRMService\./g) && !each.match(/PDMService\./g) ) {
                if (def['@PersonalData.EntitySemantics'] === 'DataSubject') dataSubjects.push(each)
                else if (def['@PersonalData.EntitySemantics'] === 'Other') legalGrounds.push(each)
            }
        }
        if (dataSubjects.length === 0) {
            this.pushMessage('No data subject entity found - this leads to issues with DRM and PDM!', WARNING)
        } else {
            dataSubjects.forEach(dsName => {
                const ds = m.definitions[dsName]
                if (!ds['@Communication.Contact.n.given'] || !ds['@Communication.Contact.n.surname'] || !(ds['@Communication.Contact.email'] || ds['@Communication.Contact.bday'])) {
                    this.pushMessage(`${ds.$location.file}:${ds.$location.line}:${ds.$location.col} For DRM and PDM the Data Subject ${dsName} has to be annotated with @Communication.Contact and name as well as email or bday have to be defined!`, WARNING)
                }
            }) 
        }

        if (legalGrounds.length === 0) {
            this.pushMessage('No legal grounds (EntitySemantics = Other) found - are you sure your service does not has any transactional data?', WARNING)
        } else {
            legalGrounds.forEach(dsName => {
                const lg = m.definitions[dsName]
                let hasEOB, hasDS, hasLegal
                if (!lg['@Core.Description'] && !lg['@description']) {
                    this.pushMessage(`${lg.$location.file}:${lg.$location.line}:${lg.$location.col} Legal ground ${dsName} is lacking @Core.Description or @description, which is used for the DRM provisioning`, INFO)
                }
                for (const e in lg.elements) {
                    const element = lg.elements[e]
                    if (element['@PersonalData.FieldSemantics'] === 'DataSubjectID') hasDS = true
                    else if (element['@PersonalData.FieldSemantics'] === 'LegalEntityID') hasLegal = true
                    else if (element['@PersonalData.FieldSemantics'] === 'EndOfBusinessDate') hasEOB = true
                }
                if (!hasDS || !hasEOB || !hasLegal) {
                    //REVISIT: Warning only if we also check that we cannot use a comp to one for field
                    this.pushMessage(`Some field semantics are missing on ${dsName}`, INFO)
                }
            }) 
        }

        //TODO - add more annotation validations
    }
}

async function _getMta(logger) {
    // yaml.parse  oesn't like null
    const mtaFilePath = path.join(cds.root, MTA_YAML)

    const existsMtaYaml = await fs.pathExists(mtaFilePath)
    if (!existsMtaYaml) {
        logger.debug('mta.yaml not existing')
        return null
    }

    const yamlStr = await fs.readFile(mtaFilePath, UTF_8)

    // yaml returns null if string couldn't be parsed, e.g. empty string
    return cds.parse.yaml(yamlStr)
}