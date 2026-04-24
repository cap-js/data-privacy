const cds = require("@sap/cds");
const { path } = cds.utils;
const fs = require("fs/promises");
const fsSync = require("fs");
const yaml = require("yaml");
const { getTranslationKey } = require("../utils");

const { merge } = require("@sap/cds-dk/lib/init/merge");
const { readProject } = require("@sap/cds-dk/lib/init/projectReader");

module.exports = class DPIPlugin extends cds.build.Plugin {
  static taskDefaults = { src: cds.env.folders.srv };
  static hasTask() {
    return true;
  }
  init() {
    this.task.dest = path.join(this.task.dest, "../db");
  }
  async build() {
    const model = await this.model();
    if (!model) return;
    const csn = await cds.compile.for.nodejs(model);

    // Enhance CSN with DPI metadata needed for config generation
    const enhanceModel = require("../csn-enhancements");
    enhanceModel(csn);

    try {
      await this.updateRetentionConfig(csn);
    } catch (err) {
      this.error(`Error updating retention config: ${err.message}`);
    }

    try {
      await this.updateHelmConfig(csn);
    } catch (err) {
      this.error(`Error updating Helm config: ${err.message}`);
    }

    if (cds.env.requires.db?.kind === "hana") {
      await this.verifyHANAaccessRestrictions();
    }

    //Merge collected messages from model enhancement into build messages
    this.messages.push(...cds._dpi.buildMessages);
  }

  error(...message) {
    this.pushMessage(message.join(" "), cds.build.Plugin.ERROR);
  }
  info(...message) {
    this.pushMessage(message.join(" "), cds.build.Plugin.INFO);
  }
  warn(...message) {
    this.pushMessage(message.join(" "), cds.build.Plugin.WARNING);
  }
  debug(...message) {
    this.pushMessage(message.join(" "), cds.build.Plugin.DEBUG);
  }

  async updateRetentionConfig(csn) {
    const project = readProject();
    const { hasMta } = project;
    if (hasMta) {
      const mta = cds.parse.yaml(
        await fs.readFile(path.join(cds.root, "mta.yaml"), {
          encoding: "utf-8"
        })
      );
      const dpiRetentionInstance = mta.resources.find(
        (r) =>
          r.parameters?.service === "data-privacy-integration-service" &&
          r.parameters?.config?.dataPrivacyConfiguration?.configType === "retention"
      );
      if (dpiRetentionInstance) {
        let dataSubjectRoles = [];
        const dataSubjects = Object.keys(
          csn.definitions["sap.ilm.RetentionService"]._dpi.dataSubjects
        );
        if (dataSubjects.length) {
          dataSubjectRoles = dataSubjects.reduce((formattedDataSubjects, dataSubject) => {
            const entity =
              csn.definitions["sap.ilm.RetentionService"]._dpi.dataSubjects[dataSubject];
            if (typeof entity["@PersonalData.DataSubjectRole"] === "string") {
              formattedDataSubjects.push(
                this.formatDataSubjectForConfig(
                  entity["@PersonalData.DataSubjectRole"],
                  entity,
                  csn
                )
              );
            } else {
              //Dynamic data subject role
              if (entity.elements[entity["@PersonalData.DataSubjectRole"]["="]]?.enum) {
                const roles = Object.keys(
                  entity.elements[entity["@PersonalData.DataSubjectRole"]["="]]?.enum
                );
                for (const role of roles) {
                  formattedDataSubjects.push(this.formatDataSubjectForConfig(role, entity, csn));
                }
              } else {
                this.error(
                  `You must define an enum for the property ${entity["@PersonalData.DataSubjectRole"]["="]} defining the data subject roles on the data subject ${dataSubject} when using dynamic data subjects`
                );
              }
            }
            return formattedDataSubjects;
          }, []);
        } else {
          this.error(
            `You must define at least one data subject via @PersonalData.EntitySemantics : 'DataSubject' for the Data Privacy Retention service to work.`
          );
        }

        const orgAttributes = Object.keys(csn.definitions).filter((n) =>
          n.startsWith("sap.ilm.RetentionService.valueHelp_orgAttribute")
        );
        const organizationAttributes = orgAttributes.map((orgAttributeEntityName) => {
          const orgAttributeDefinition = csn.definitions[orgAttributeEntityName];
          const orgAttribute = {
            organizationAttributeName: orgAttributeDefinition["@ILM.OrganizationAttributeName"],
            organizationAttributeDescription:
              cds.i18n.labels.for(orgAttributeDefinition) ??
              cds.i18n.labels.key4(orgAttributeDefinition),
            organizationAttributeDescriptionKey: undefined,
            organizationAttributeBaseURL: "~{srv-api/srv-url}",
            organizationAttributeValueHelpEndPoint: orgAttributeDefinition["@ILM.ValueHelp.Path"]
          };
          const descriptionI18nKey = getTranslationKey(orgAttributeDefinition["@Common.Label"]);
          if (descriptionI18nKey) {
            orgAttribute.organizationAttributeDescriptionKey = descriptionI18nKey;
          }
          return orgAttribute;
        });

        const resources = {
          in: "resources",
          where: { name: dpiRetentionInstance.name }
        };
        const dataSubjectRoleAdditions = (dataSubjectRoles ?? []).map((dsr) => ({
          in: "parameters.config.dataPrivacyConfiguration.retentionConfiguration.dataSubjectRoles",
          where: { dataSubjectRoleName: dsr.dataSubjectRoleName }
        }));
        const organizationAttributeAdditions = organizationAttributes.map((orgAttr) => ({
          in: "parameters.config.dataPrivacyConfiguration.retentionConfiguration.organizationAttributes",
          where: {
            organizationAttributeName: orgAttr.organizationAttributeName
          }
        }));

        // Throw warning for organizational attributes no longer covered by the model
        if (
          dpiRetentionInstance.parameters?.config?.dataPrivacyConfiguration?.retentionConfiguration
            ?.organizationAttributes &&
          organizationAttributes &&
          dpiRetentionInstance.parameters?.config?.dataPrivacyConfiguration?.retentionConfiguration?.organizationAttributes.some(
            (orgAttr) =>
              !organizationAttributes.some(
                (newAttr) => newAttr.organizationAttributeName === orgAttr.organizationAttributeName
              )
          )
        ) {
          const outdatedAttributes =
            dpiRetentionInstance.parameters?.config?.dataPrivacyConfiguration?.retentionConfiguration?.organizationAttributes.filter(
              (orgAttr) =>
                !organizationAttributes.some(
                  (newAttr) =>
                    newAttr.organizationAttributeName === orgAttr.organizationAttributeName
                )
            );
          for (const attr of outdatedAttributes) {
            this.warn(
              `Your current deployment configuration contains an outdated organizational attribute ${attr.organizationAttributeName}! Please remove it if you no longer need it.`
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
                        : {})
                    }
                  }
                }
              }
            }
          ]
        }).into("mta.yaml", {
          project,
          additions: [resources, ...dataSubjectRoleAdditions, ...organizationAttributeAdditions]
        });
      }
    }
  }

  async updateHelmConfig(csn) {
    const project = readProject();
    const { hasHelm } = project;

    if (hasHelm) {
      // Work with both chart/ (source) and gen/chart/ (generated) locations
      const sourceChartPath = path.join(cds.root, "chart/Chart.yaml");
      const sourceValuesPath = path.join(cds.root, "chart/values.yaml");
      const genChartPath = path.join(cds.root, "gen/chart/Chart.yaml");
      const genValuesPath = path.join(cds.root, "gen/chart/values.yaml");

      // Try source chart/ folder first, then gen/chart/ folder
      let chartYamlPath, valuesYamlPath;
      if (fsSync.existsSync(sourceChartPath) && fsSync.existsSync(sourceValuesPath)) {
        chartYamlPath = sourceChartPath;
        valuesYamlPath = sourceValuesPath;
      } else if (fsSync.existsSync(genChartPath) && fsSync.existsSync(genValuesPath)) {
        chartYamlPath = genChartPath;
        valuesYamlPath = genValuesPath;
      } else {
        return; // No helm charts found
      }

      // Read existing chart configuration
      const chartYamlContent = await fs.readFile(chartYamlPath, "utf-8");
      const chartYaml = yaml.parse(chartYamlContent);

      const valuesYamlContent = await fs.readFile(valuesYamlPath, "utf-8");
      const valuesYaml = yaml.parse(valuesYamlContent);

      // Check if DPI services already exist
      const hasInformationService = chartYaml.dependencies?.some((d) => d.alias === "information");
      const hasRetentionService = chartYaml.dependencies?.some((d) => d.alias === "retention");

      // Update xsuaa scopes for DPI services (do this even if services already exist)
      if (valuesYaml.xsuaa?.parameters) {
        this.updateXsuaaScopesForDPI(valuesYaml.xsuaa.parameters);
      }

      if (hasInformationService && hasRetentionService) {
        // Write the updated values.yaml even if services exist (for xsuaa scopes)
        await fs.writeFile(valuesYamlPath, yaml.stringify(valuesYaml), "utf-8");
        this.info("DPI services already configured in Helm chart");
        return; // Already configured
      }

      // Add DPI service dependencies to Chart.yaml
      if (!hasInformationService || !hasRetentionService) {
        this.updateHelmChartDependencies(chartYaml, hasInformationService, hasRetentionService);
        await fs.writeFile(chartYamlPath, yaml.stringify(chartYaml), "utf-8");
      }

      // Add DPI service configurations to values.yaml
      if (!hasInformationService) {
        valuesYaml.information = this.getDPIInformationConfig();
      }

      if (!hasRetentionService) {
        valuesYaml.retention = this.getDPIRetentionConfig(csn);
      }

      // Update srv bindings if needed
      if (valuesYaml.srv?.bindings && (!hasInformationService || !hasRetentionService)) {
        if (!hasInformationService && !valuesYaml.srv.bindings.information) {
          valuesYaml.srv.bindings.information = { serviceInstanceName: "information" };
        }
        if (!hasRetentionService && !valuesYaml.srv.bindings.retention) {
          valuesYaml.srv.bindings.retention = { serviceInstanceName: "retention" };
        }
      }

      await fs.writeFile(valuesYamlPath, yaml.stringify(valuesYaml), "utf-8");
      this.info("Updated Helm chart with DPI services (information and retention)");
    }
  }

  updateHelmChartDependencies(chartYaml, hasInformation, hasRetention) {
    if (!chartYaml.dependencies) {
      chartYaml.dependencies = [];
    }

    if (!hasInformation) {
      chartYaml.dependencies.push({
        name: "service-instance",
        alias: "information",
        version: ">0.0.0"
      });
    }

    if (!hasRetention) {
      chartYaml.dependencies.push({
        name: "service-instance",
        alias: "retention",
        version: ">0.0.0"
      });
    }
  }

  updateXsuaaScopesForDPI(xsuaaParams) {
    if (!xsuaaParams.scopes) {
      xsuaaParams.scopes = [];
    }

    // Add or update PersonalDataManagerUser scope
    const personalDataScope = xsuaaParams.scopes.find((s) =>
      s.name?.includes("PersonalDataManagerUser")
    );
    if (personalDataScope) {
      // Update existing scope with grant-as-authority-to-apps
      personalDataScope["grant-as-authority-to-apps"] = ["{{ .Release.Name }}-information"];
    } else {
      // Add new scope
      xsuaaParams.scopes.push({
        name: "$XSAPPNAME.PersonalDataManagerUser",
        description: "Technical scope to restrict access to information endpoint",
        "grant-as-authority-to-apps": ["{{ .Release.Name }}-information"]
      });
    }

    // Add or update DataRetentionManagerUser scope
    const retentionScope = xsuaaParams.scopes.find((s) => s.name?.includes("DataRetentionManagerUser"));
    if (retentionScope) {
      // Update existing scope with grant-as-authority-to-apps
      retentionScope["grant-as-authority-to-apps"] = ["{{ .Release.Name }}-retention"];
    } else {
      // Add new scope
      xsuaaParams.scopes.push({
        name: "$XSAPPNAME.DataRetentionManagerUser",
        description: "Technical scope to restrict access to retention endpoint",
        "grant-as-authority-to-apps": ["{{ .Release.Name }}-retention"]
      });
    }
  }

  getDPIInformationConfig() {
    return {
      serviceOfferingName: "data-privacy-integration-service",
      servicePlanName: "data-privacy-internal",
      parameters: {
        "xs-security": {
          xsappname: "{{ .Release.Name }}-information",
          authorities: ["$ACCEPT_GRANTED_AUTHORITIES"],
          "oauth2-configuration": {
            "credential-types": ["binding-secret", "x509"]
          }
        },
        dataPrivacyConfiguration: {
          applicationConfiguration: {
            applicationName: "{{ .Release.Name }}-information",
            applicationTitle: "{{ .Release.Name }}",
            enableAutoSubscription: true
          },
          configType: "information",
          informationConfiguration: {
            applicationConfiguration: {
              cacheControl: "no-cache",
              dataSubjectDeletionAgent: "retention-manager",
              disableDataSubjectCorrection: true,
              retentionApplicationName: "{{ .Release.Name }}-retention"
            },
            components: [
              {
                componentBaseURL: "~{srv-api/srv-url}",
                componentName: "{{ .Release.Name }}-srv",
                serviceEndPoints: [
                  {
                    annotationFormat: "v4",
                    appPaginationEnabled: true,
                    cacheControl: "no-cache",
                    serviceEndPoint: "/dpp/information",
                    serviceFormat: "odata-v4",
                    serviceName: "{{ .Release.Name }}-service"
                  }
                ]
              }
            ]
          }
        }
      }
    };
  }

  getDPIRetentionConfig(csn) {
    let dataSubjectRoles = [];
    let organizationAttributes = [];

    const dataSubjects = Object.keys(
      csn.definitions["sap.ilm.RetentionService"]?._dpi?.dataSubjects || {}
    );

    if (dataSubjects.length) {
      dataSubjectRoles = dataSubjects.reduce((formattedDataSubjects, dataSubject) => {
        const entity = csn.definitions["sap.ilm.RetentionService"]._dpi.dataSubjects[dataSubject];
        if (typeof entity["@PersonalData.DataSubjectRole"] === "string") {
          formattedDataSubjects.push(
            this.formatDataSubjectForConfig(entity["@PersonalData.DataSubjectRole"], entity, csn)
          );
        } else {
          // Dynamic data subject role
          if (entity.elements[entity["@PersonalData.DataSubjectRole"]["="]]?.enum) {
            const roles = Object.keys(
              entity.elements[entity["@PersonalData.DataSubjectRole"]["="]]?.enum
            );
            for (const role of roles) {
              formattedDataSubjects.push(this.formatDataSubjectForConfig(role, entity, csn));
            }
          }
        }
        return formattedDataSubjects;
      }, []);
    }

    const orgAttributes = Object.keys(csn.definitions).filter((n) =>
      n.startsWith("sap.ilm.RetentionService.valueHelp_orgAttribute")
    );
    organizationAttributes = orgAttributes.map((orgAttributeEntityName) => {
      const orgAttributeDefinition = csn.definitions[orgAttributeEntityName];
      const orgAttribute = {
        organizationAttributeName: orgAttributeDefinition["@ILM.OrganizationAttributeName"],
        organizationAttributeDescription:
          cds.i18n.labels.for(orgAttributeDefinition) ??
          cds.i18n.labels.key4(orgAttributeDefinition),
        organizationAttributeDescriptionKey: undefined,
        organizationAttributeBaseURL: "~{srv-api/srv-url}",
        organizationAttributeValueHelpEndPoint: orgAttributeDefinition["@ILM.ValueHelp.Path"]
      };
      const descriptionI18nKey = getTranslationKey(orgAttributeDefinition["@Common.Label"]);
      if (descriptionI18nKey) {
        orgAttribute.organizationAttributeDescriptionKey = descriptionI18nKey;
      }
      return orgAttribute;
    });

    return {
      serviceOfferingName: "data-privacy-integration-service",
      servicePlanName: "data-privacy-internal",
      parameters: {
        "xs-security": {
          xsappname: "{{ .Release.Name }}-retention",
          authorities: ["$ACCEPT_GRANTED_AUTHORITIES"],
          "oauth2-configuration": {
            "credential-types": ["binding-secret", "x509"]
          }
        },
        dataPrivacyConfiguration: {
          applicationConfiguration: {
            applicationBaseURL: "~{srv-api/srv-url}",
            applicationName: "{{ .Release.Name }}-retention",
            applicationTitle: "{{ .Release.Name }}",
            applicationDescription: "{{ .Release.Name }}-retention",
            applicationDescriptionKey: "APPLICATION_NAME",
            enableAutoSubscription: true
          },
          configType: "retention",
          retentionConfiguration: {
            applicationBaseURL: "~{srv-api/srv-url}",
            applicationConfiguration: {
              applicationType: "TransactionMaster",
              iLMObjectDiscoveryEndPoint: "/dpp/retention/iLMObjects"
            },
            retentionEndPoint: "/dpp/retention",
            ...(dataSubjectRoles?.length ? { dataSubjectRoles } : {}),
            ...(organizationAttributes?.length ? { organizationAttributes } : {})
          }
        }
      }
    };
  }

  formatDataSubjectForConfig(role, entity, csn) {
    const servicePath =
      csn.definitions["sap.ilm.RetentionService"].path ??
      csn.definitions["sap.ilm.RetentionService"]["@path"];
    const formattedDataSubject = {
      dataSubjectRoleName: role,
      dataSubjectDescription:
        getTranslationKey(entity["@Core.Description"]) ?? cds.i18n.labels.for(entity) ?? role,
      dataSubjectBaseURL: "~{srv-api/srv-url}",
      dataSubjectBlockingEndPoint: `${servicePath}/dataSubjectBlocking`,
      dataSubjectInformationEndPoint: `${servicePath}/dataSubjectInformation`,
      dataSubjectsDestroyingEndPoint: `${servicePath}/dataSubjectsDestroying`,
      dataSubjectDescriptionKey: undefined
    };
    const descriptionI18nKey = getTranslationKey(
      entity["@Core.Description"] || cds.i18n.labels.key4(entity)
    );
    if (descriptionI18nKey) {
      formattedDataSubject.dataSubjectDescriptionKey = descriptionI18nKey;
    }
    return formattedDataSubject;
  }

  async verifyHANAaccessRestrictions() {
    if (fsSync.existsSync(path.join(cds.root, "db/undeploy.json"))) {
      const undeployConfig = JSON.parse(
        await fs.readFile(path.join(cds.root, "db/undeploy.json"), {
          encoding: "utf-8"
        })
      );
      if (!undeployConfig.some((path) => path.endsWith("hdbanalyticprivilege"))) {
        this.warn(
          `"undeploy.json" does not include any record for ".hdbanalyticprivilege"! This may cause issues with the data privacy plugin because privileges are deployed for each view exposing personal data.`
        );
      }
    }

    if (!fsSync.existsSync(path.join(cds.root, "db/src/defaults/default_access_role.hdbrole"))) {
      this.warn(
        `"db/src/defaults/default_access_role.hdbrole" is missing! Run "cds add data-privacy" to generate it. This role is required to grant access on DPP views to CAP on HANA.`
      );
    }
  }
};
