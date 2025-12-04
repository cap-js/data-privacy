const cds = require('@sap/cds');
const { path } = cds.utils;
const { writeYAML } = require('@sap/cds-dk/lib/util/fs')
const fs = require('fs/promises');
const fsSync = require('fs');
const { getTranslationKey } = require('../utils');

module.exports = class DPIPlugin extends cds.build.Plugin {
  static taskDefaults = { src: cds.env.folders.srv }
  static hasTask() {
    return true;
  }
  init() {
    this.task.dest = path.join(this.task.dest, '../db');
  }
  async build() {
    const model = await this.model();
    if (!model) return;
    const csn = await cds.compile.for.nodejs(model)
    await this.updateRetentionConfig(csn);

    if (cds.env.requires.db?.kind === 'hana') {
      await this.addHANAaccessRestrictions(csn);
    }

    //Merge collected messages from model enhancement into build messages
    this.messages.push(...cds._dpi.buildMessages);
  }

  error(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.ERROR)
  }
  info(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.INFO)
  }
  warn(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.WARNING)
  }
  debug(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.DEBUG)
  }

  async updateRetentionConfig(csn) {
    const hasMta = await fsSync.existsSync(path.join(cds.root, 'mta.yaml'))
    if (hasMta) {
      //REVISIT: The YAML handling currently removes comments - use the merge function somehow from cds-dk
      const mta = cds.parse.yaml(await fs.readFile(path.join(cds.root, 'mta.yaml'), { encoding: 'utf-8' }));
      const dpiRetentionInstance = mta.resources.find(r => r.parameters?.service === 'data-privacy-integration-service' && r.parameters?.config?.dataPrivacyConfiguration?.configType === 'retention')
      if (dpiRetentionInstance) {
        const dataSubjects = Object.keys(csn.definitions['sap.dpp.RetentionService']._dpi.dataSubjects)
        if (dataSubjects.length) {
          dpiRetentionInstance.parameters.config.dataPrivacyConfiguration.retentionConfiguration.dataSubjectRoles = dataSubjects.reduce((formattedDataSubjects, dataSubject) => {
            const entity = csn.definitions['sap.dpp.RetentionService']._dpi.dataSubjects[dataSubject]
            if (typeof entity['@PersonalData.DataSubjectRole'] === 'string') {
              formattedDataSubjects.push(this.formatDataSubjectForConfig(entity['@PersonalData.DataSubjectRole'], entity, csn))
            } else {
              //Dynamic data subject role
              if (entity.elements[entity['@PersonalData.DataSubjectRole']['=']]?.enum) {
                const roles = Object.keys(entity.elements[entity['@PersonalData.DataSubjectRole']['=']]?.enum)
                for (const role of roles) {
                  formattedDataSubjects.push(this.formatDataSubjectForConfig(role, entity, csn))
                }
              } else {
                this.error(`You must define an enum for the property ${entity['@PersonalData.DataSubjectRole']['=']} defining the data subject roles on the data subject ${dataSubject} when using dynamic data subjects`);
              }
            }
            return formattedDataSubjects;
          }, []);
        } else {
          this.error(`You must define at least one data subject via @PersonalData.EntitySemantics : 'DataSubject' for the Data Privacy Retention service to work.`);
        }
        const orgAttributes = Object.keys(csn.definitions).filter(n => n.startsWith('sap.dpp.RetentionService.valueHelp_orgAttribute'))
        dpiRetentionInstance.parameters.config.dataPrivacyConfiguration.retentionConfiguration.organizationAttributes = orgAttributes.map(orgAttributeEntityName => {
          const orgAttributeDefinition = csn.definitions[orgAttributeEntityName];
          const orgAttribute = {
            organizationAttributeName: orgAttributeDefinition['@ILM.OrganizationAttributeName'],
            organizationAttributeDescription: cds.i18n.labels.for(orgAttributeDefinition) ?? cds.i18n.labels.key4(orgAttributeDefinition),
            organizationAttributeDescriptionKey: undefined,
            organizationAttributeBaseURL: '~{srv-api/srv-url}',
            organizationAttributeValueHelpEndPoint: orgAttributeDefinition['@ILM.ValueHelp.Path']
          }
          const descriptionI18nKey = getTranslationKey(orgAttributeDefinition['@Common.Label']);
          if (descriptionI18nKey) {
            orgAttribute.organizationAttributeDescriptionKey = descriptionI18nKey;
          }
          return orgAttribute;
        });
      }

      await writeYAML(path.join(cds.root, 'mta.yaml'), mta);
    }
  }

  formatDataSubjectForConfig(role, entity, csn) {
    const servicePath = csn.definitions['sap.dpp.RetentionService'].path ?? csn.definitions['sap.dpp.RetentionService']['@path'];
    const formattedDataSubject = {
      dataSubjectRoleName: role,
      dataSubjectDescription: getTranslationKey(entity['@Core.Description']) ?? cds.i18n.labels.for(entity) ?? role,
      dataSubjectBaseURL: '~{srv-api/srv-url}',
      dataSubjectBlockingEndPoint: `${servicePath}/dataSubjectBlocking`,
      dataSubjectInformationEndPoint: `${servicePath}/dataSubjectInformation`,
      dataSubjectsDestroyingEndPoint: `${servicePath}/dataSubjectsDestroying`,
      dataSubjectDescriptionKey: undefined
    }
    const descriptionI18nKey = getTranslationKey(entity['@Core.Description'] || cds.i18n.labels.key4(entity))
    if (descriptionI18nKey) {
      formattedDataSubject.dataSubjectDescriptionKey = descriptionI18nKey;
    }
    return formattedDataSubject
  }

  async addHANAaccessRestrictions(csn) {

    if (fsSync.existsSync(path.join(cds.root, 'db/undeploy.json'))) {
      const undeployConfig = JSON.parse(await fs.readFile(path.join(cds.root, 'db/undeploy.json'), { encoding: 'utf-8' }));
      if (!undeployConfig.some(path => path.endsWith('hdbanalyticprivilege'))) {
        this.warn(`"undeploy.json" does not include any record for ".hdbanalyticprivilege"! This may cause issues with the data privacy plugin because privileges are deployed for each view exposing personal data.`)
      }
    }

    const default_access_role = {
      role: {
        name: "default_access_role",
        pattern_escape_character: "/",
        schema_privileges: [
          {
            // SELECT is assigned via DPPRestrictBlockedDataAccess to exclude tables
            privileges: ["INSERT", "UPDATE", "DELETE", "EXECUTE", "CREATE TEMPORARY TABLE", "SELECT CDS METADATA"]
          }
        ],
        schema_roles: [
          {
            names: ["sap.dpp.RestrictBlockedDataAccess"]
          }
        ]
      }
    }
    
    await this.write(default_access_role).to('src/defaults/default_access_role.hdbrole');
    // .hdiconfig needs to be added in default as well because in the base scenario db/src/.hdiconfig might be missing
    await this.write({
      minimum_feature_version: "1000",
      file_suffixes: {
        hdbrole: {
          plugin_name: "com.sap.hana.di.role"
        }
      }
    }).to('src/defaults/.hdiconfig');

    //TODO: Show blockingDate in PDM UI (Check PDM any ways)
  }
}