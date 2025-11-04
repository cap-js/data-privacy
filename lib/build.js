const cds = require('@sap/cds');
const { path } = cds.utils;
const fs = require('fs/promises');
const fsSync = require('fs');
const { getTranslationKey } = require('./utils');

module.exports = class DPIPlugin extends cds.build.Plugin {
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
    const csn = cds.reflect(model)
    await this.updateRetentionConfig(csn);

    //Merge collected messages from model enhancement into build messages
    this.messages.push(...cds._dpi.buildMessages);
  }

  error(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.ERROR)
  }
  info(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.INFO)
  }
  warning(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.WARNING)
  }
  debug(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.DEBUG)
  }

  async updateRetentionConfig(csn) {
    const hasMta = await fsSync.existsSync(path.join(cds.root, 'mta.yaml'))
    if (hasMta) {
      const mta = cds.parse.yaml(await fs.readFile(path.join(cds.root, 'mta.yaml'), {encoding: 'utf-8'}));
      const dpiRetentionInstance = mta.resources.find(r => r.parameters?.service === 'data-privacy-integration-service' && r.parameters?.config?.dataPrivacyConfiguration?.configType === 'retention')
      const dpiRetentionConfiguration = {dataPrivacyConfiguration: {retentionConfiguration: {}}};
      if (dpiRetentionInstance) {
        const dataSubjects = Object.keys(csn.definitions.DPIRetentionService._dpi.dataSubjects)
        if (dataSubjects.length) {
          dpiRetentionConfiguration.dataPrivacyConfiguration.retentionConfiguration.dataSubjectRoles = dataSubjects.reduce((formattedDataSubjects, dataSubject) => {
            const entity = csn.definitions.DPIRetentionService._dpi.dataSubjects[dataSubject]
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
        const orgAttributes = Object.keys(csn.definitions).filter(n => n.startsWith('DPIRetentionService.valueHelp_orgAttribute'))
        dpiRetentionConfiguration.dataPrivacyConfiguration.retentionConfiguration.organizationAttributes = orgAttributes.map(orgAttributeEntityName => {
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

      const DPIRetentionConfigFile = path.join(cds.root, dpiRetentionInstance.parameters.path ?? `./btp-data-privacy.json`);
      if (fsSync.existsSync(DPIRetentionConfigFile)) {
        const config = JSON.parse(await fs.readFile(DPIRetentionConfigFile, {encoding: 'utf-8'}));
        await fs.writeFile(DPIRetentionConfigFile, JSON.stringify(Object.assign(config, dpiRetentionConfiguration), undefined, 2))
      } else {
        await fs.writeFile(DPIRetentionConfigFile, JSON.stringify(dpiRetentionConfiguration,undefined, 2))
      };
    }
  }

  formatDataSubjectForConfig(role, entity, csn) {
    const servicePath = csn.definitions.DPIRetentionService.path ?? csn.definitions.DPIRetentionService['@path'];
    const formattedDataSubject = {
      dataSubjectRoleName: role,
      dataSubjectDescription: getTranslationKey(entity['@Core.Description']) ?? cds.i18n.labels.for(entity),
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
}