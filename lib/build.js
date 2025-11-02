const cds = require('@sap/cds');
const { INFO, WARNING, ERROR } = cds.build.Plugin;

const { path } = cds.utils;
const jsyaml = require('js-yaml');
const fs = require('fs/promises');
const fsSync = require('fs');
const { translationUtils } = require('./utils');

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
    const csn = cds.compile.for.nodejs(model)
    await this.updateRetentionConfig(csn);
    this.annotationHelper(model);
  }

  async updateRetentionConfig(csn) {
    const hasMta = await fsSync.existsSync(path.join(cds.root, 'mta.yaml'))
    if (hasMta) {
      const mta = jsyaml.load(await fs.readFile(path.join(cds.root, 'mta.yaml')));
      const dpiRetentionInstance = mta.resources.find(r => r.parameters?.service === 'data-privacy-integration-service' && r.parameters?.config?.dataPrivacyConfiguration?.configType === 'retention')
      if (dpiRetentionInstance && dpiRetentionInstance.parameters?.config?.dataPrivacyConfiguration?.retentionConfiguration) {
        const dataSubjects = Object.keys(csn.definitions.DPIRetentionService._dpi.dataSubjects)
        if (dataSubjects.length) {
          dpiRetentionInstance.parameters.config.dataPrivacyConfiguration.retentionConfiguration.dataSubjectRoles = dataSubjects.reduce((formattedDataSubjects, dataSubject) => {
            const entity = csn.definitions.DPIRetentionService._dpi.dataSubjects[dataSubject]
            if (typeof entity['@PersonalData.DataSubjectRole'] === 'string') {
              formattedDataSubjects.push(this.formatDataSubjectForConfig(entity['@PersonalData.DataSubjectRole'], dataSubject, entity, csn))
            } else {
              //Dynamic data subject role
              if (entity.elements[entity['@PersonalData.DataSubjectRole']['=']]?.enum) {
                const roles = Object.keys(entity.elements[entity['@PersonalData.DataSubjectRole']['=']]?.enum)
                for (const role of roles) {
                  formattedDataSubjects.push(this.formatDataSubjectForConfig(role, dataSubject, entity, csn))
                }
              } else {
                this.pushMessage(`You must define an enum for the property ${entity['@PersonalData.DataSubjectRole']['=']} defining the data subject roles on the data subject ${dataSubject} when using dynamic data subjects`, ERROR);
              }
            }
            return formattedDataSubjects;
          }, []);
        } else {
          this.pushMessage(`You must define at least one data subject via @PersonalData.EntitySemantics : 'DataSubject' for the Data Privacy Retention service to work.`, ERROR);
        }
        const orgAttributes = Object.keys(csn.definitions.DPIRetentionService._dpi.dataSubjects)
        dpiRetentionInstance.parameters.config.dataPrivacyConfiguration.retentionConfiguration.organizationAttributes = orgAttributes;
      }
      const fullMTA = jsyaml.dump(mta)
      await fs.writeFile(path.join(cds.root, 'mta.yaml'), fullMTA)
    }
  }

  formatDataSubjectForConfig(role, dataSubject, entity, csn) {
    const { translate, getTranslationKey } = translationUtils(csn)
    const servicePath = csn.definitions.DPIRetentionService.path ?? csn.definitions.DPIRetentionService['@path'];
    const formattedDataSubject = {
      dataSubjectRoleName: role,
      dataSubjectDescription: translate(entity['@Core.Description'] || dataSubject),
      dataSubjectBaseURL: '~{srv-api/srv-url}',
      dataSubjectBlockingEndPoint: `${servicePath}/dataSubjectBlocking`,
      dataSubjectInformationEndPoint: `${servicePath}/dataSubjectInformation`,
      dataSubjectsDestroyingEndPoint: `${servicePath}/dataSubjectsDestroying`,
      dataSubjectDescriptionKey: undefined
    }
    if (getTranslationKey(entity['@Core.Description'] || dataSubject)) {
      const key = getTranslationKey(entity['@Core.Description'] || dataSubject);
      formattedDataSubject.dataSubjectDescriptionKey = key;
    }
    return formattedDataSubject
  }
}