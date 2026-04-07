const cds = require('@sap/cds');
const { path } = cds.utils;
const fs = require('fs/promises');
const fsSync = require('fs');
const { getTranslationKey } = require('../utils');

const { merge } = require('@sap/cds-dk/lib/init/merge');
const { readProject } = require('@sap/cds-dk/lib/init/projectReader');

module.exports = class DPIPlugin extends cds.build.Plugin {
  static taskDefaults = { src: cds.env.folders.srv };
  static hasTask() {
    return true;
  }
  init() {
    this.task.dest = path.join(this.task.dest, '../db');
  }
  async build() {
    const model = await this.model();
    if (!model) return;
    const csn = await cds.compile.for.nodejs(model);
    await this.updateRetentionConfig(csn);

    if (cds.env.requires.db?.kind === 'hana') {
      await this.addHANAaccessRestrictions();
    }

    //Merge collected messages from model enhancement into build messages
    this.messages.push(...cds._dpi.buildMessages);
  }

  error(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.ERROR);
  }
  info(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.INFO);
  }
  warn(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.WARNING);
  }
  debug(...message) {
    this.pushMessage(message.join(' '), cds.build.Plugin.DEBUG);
  }

  async updateRetentionConfig(csn) {
    const project = readProject();
    const { hasMta } = project;
    if (hasMta) {
      const mta = cds.parse.yaml(
        await fs.readFile(path.join(cds.root, 'mta.yaml'), {
          encoding: 'utf-8',
        }),
      );
      const dpiRetentionInstance = mta.resources.find(
        (r) =>
          r.parameters?.service === 'data-privacy-integration-service' &&
          r.parameters?.config?.dataPrivacyConfiguration?.configType === 'retention',
      );
      if (dpiRetentionInstance) {
        let dataSubjectRoles = [];
        const dataSubjects = Object.keys(
          csn.definitions['sap.ilm.RetentionService']._dpi.dataSubjects,
        );
        if (dataSubjects.length) {
          dataSubjectRoles = dataSubjects.reduce((formattedDataSubjects, dataSubject) => {
            const entity =
              csn.definitions['sap.ilm.RetentionService']._dpi.dataSubjects[dataSubject];
            if (typeof entity['@PersonalData.DataSubjectRole'] === 'string') {
              formattedDataSubjects.push(
                this.formatDataSubjectForConfig(
                  entity['@PersonalData.DataSubjectRole'],
                  entity,
                  csn,
                ),
              );
            } else {
              //Dynamic data subject role
              if (entity.elements[entity['@PersonalData.DataSubjectRole']['=']]?.enum) {
                const roles = Object.keys(
                  entity.elements[entity['@PersonalData.DataSubjectRole']['=']]?.enum,
                );
                for (const role of roles) {
                  formattedDataSubjects.push(this.formatDataSubjectForConfig(role, entity, csn));
                }
              } else {
                this.error(
                  `You must define an enum for the property ${entity['@PersonalData.DataSubjectRole']['=']} defining the data subject roles on the data subject ${dataSubject} when using dynamic data subjects`,
                );
              }
            }
            return formattedDataSubjects;
          }, []);
        } else {
          this.error(
            `You must define at least one data subject via @PersonalData.EntitySemantics : 'DataSubject' for the Data Privacy Retention service to work.`,
          );
        }

        const orgAttributes = Object.keys(csn.definitions).filter((n) =>
          n.startsWith('sap.ilm.RetentionService.valueHelp_orgAttribute'),
        );
        const organizationAttributes = orgAttributes.map((orgAttributeEntityName) => {
          const orgAttributeDefinition = csn.definitions[orgAttributeEntityName];
          const orgAttribute = {
            organizationAttributeName: orgAttributeDefinition['@ILM.OrganizationAttributeName'],
            organizationAttributeDescription:
              cds.i18n.labels.for(orgAttributeDefinition) ??
              cds.i18n.labels.key4(orgAttributeDefinition),
            organizationAttributeDescriptionKey: undefined,
            organizationAttributeBaseURL: '~{srv-api/srv-url}',
            organizationAttributeValueHelpEndPoint: orgAttributeDefinition['@ILM.ValueHelp.Path'],
          };
          const descriptionI18nKey = getTranslationKey(orgAttributeDefinition['@Common.Label']);
          if (descriptionI18nKey) {
            orgAttribute.organizationAttributeDescriptionKey = descriptionI18nKey;
          }
          return orgAttribute;
        });

        const resources = {
          in: 'resources',
          where: { name: dpiRetentionInstance.name },
        };
        const dataSubjectRoleAdditions = (dataSubjectRoles ?? []).map((dsr) => ({
          in: 'parameters.config.dataPrivacyConfiguration.retentionConfiguration.dataSubjectRoles',
          where: { dataSubjectRoleName: dsr.dataSubjectRoleName },
        }));
        const organizationAttributeAdditions = organizationAttributes.map((orgAttr) => ({
          in: 'parameters.config.dataPrivacyConfiguration.retentionConfiguration.organizationAttributes',
          where: {
            organizationAttributeName: orgAttr.organizationAttributeName,
          },
        }));

        // Throw warning for organizational attributes no longer covered by the model
        if (
          dpiRetentionInstance.parameters?.config?.dataPrivacyConfiguration?.retentionConfiguration
            ?.organizationAttributes &&
          organizationAttributes &&
          dpiRetentionInstance.parameters?.config?.dataPrivacyConfiguration?.retentionConfiguration?.organizationAttributes.some(
            (orgAttr) =>
              !organizationAttributes.some(
                (newAttr) =>
                  newAttr.organizationAttributeName === orgAttr.organizationAttributeName,
              ),
          )
        ) {
          const outdatedAttributes =
            dpiRetentionInstance.parameters?.config?.dataPrivacyConfiguration?.retentionConfiguration?.organizationAttributes.filter(
              (orgAttr) =>
                !organizationAttributes.some(
                  (newAttr) =>
                    newAttr.organizationAttributeName === orgAttr.organizationAttributeName,
                ),
            );
          for (const attr of outdatedAttributes) {
            this.warn(
              `Your current deployment configuration contains an outdated organizational attribute ${attr.organizationAttributeName}! Please remove it if you no longer need it.`,
            );
          }
        }

        await merge({
          resources: [
            {
              name: dpiRetentionInstance.name,
              parameters: {
                config: {
                  dataPrivacyConfiguration: {
                    retentionConfiguration: {
                      ...(dataSubjectRoles?.length ? { dataSubjectRoles: dataSubjectRoles } : {}),
                      ...(organizationAttributes?.length
                        ? { organizationAttributes: organizationAttributes }
                        : {}),
                    },
                  },
                },
              },
            },
          ],
        }).into('mta.yaml', {
          project,
          additions: [resources, ...dataSubjectRoleAdditions, ...organizationAttributeAdditions],
        });
      }
    }
  }

  formatDataSubjectForConfig(role, entity, csn) {
    const servicePath =
      csn.definitions['sap.ilm.RetentionService'].path ??
      csn.definitions['sap.ilm.RetentionService']['@path'];
    const formattedDataSubject = {
      dataSubjectRoleName: role,
      dataSubjectDescription:
        getTranslationKey(entity['@Core.Description']) ?? cds.i18n.labels.for(entity) ?? role,
      dataSubjectBaseURL: '~{srv-api/srv-url}',
      dataSubjectBlockingEndPoint: `${servicePath}/dataSubjectBlocking`,
      dataSubjectInformationEndPoint: `${servicePath}/dataSubjectInformation`,
      dataSubjectsDestroyingEndPoint: `${servicePath}/dataSubjectsDestroying`,
      dataSubjectDescriptionKey: undefined,
    };
    const descriptionI18nKey = getTranslationKey(
      entity['@Core.Description'] || cds.i18n.labels.key4(entity),
    );
    if (descriptionI18nKey) {
      formattedDataSubject.dataSubjectDescriptionKey = descriptionI18nKey;
    }
    return formattedDataSubject;
  }

  async addHANAaccessRestrictions() {
    if (fsSync.existsSync(path.join(cds.root, 'db/undeploy.json'))) {
      const undeployConfig = JSON.parse(
        await fs.readFile(path.join(cds.root, 'db/undeploy.json'), {
          encoding: 'utf-8',
        }),
      );
      if (!undeployConfig.some((path) => path.endsWith('hdbanalyticprivilege'))) {
        this.warn(
          `"undeploy.json" does not include any record for ".hdbanalyticprivilege"! This may cause issues with the data privacy plugin because privileges are deployed for each view exposing personal data.`,
        );
      }
    }

    const default_access_role = {
      role: {
        name: 'default_access_role',
        pattern_escape_character: '/',
        schema_privileges: [
          {
            // SELECT is assigned via DPPRestrictBlockedDataAccess to exclude tables
            privileges: [
              'INSERT',
              'UPDATE',
              'DELETE',
              'EXECUTE',
              'CREATE TEMPORARY TABLE',
              'SELECT CDS METADATA',
            ],
          },
        ],
        schema_roles: [
          {
            names: ['sap.ilm.RestrictBlockedDataAccess'],
          },
        ],
      },
    };

    await this.write(default_access_role).to('src/defaults/default_access_role.hdbrole');
    // .hdiconfig needs to be added in default as well because in the base scenario db/src/.hdiconfig might be missing
    await this.write({
      minimum_feature_version: '1000',
      file_suffixes: {
        hdbrole: {
          plugin_name: 'com.sap.hana.di.role',
        },
      },
    }).to('src/defaults/.hdiconfig');

    //TODO: Show blockingDate in PDM UI (Check PDM any ways)
  }
};
