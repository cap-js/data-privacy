const cds = require("@sap/cds");
const { path } = cds.utils;
const fs = require("fs/promises");
const fsSync = require("fs");
const { getTranslationKey } = require("../utils");

const { merge } = require("@sap/cds-dk/lib/init/merge");
const { readProject } = require("@sap/cds-dk/lib/init/projectReader");

const K8S_BASE_URL = "https://{{ .Release.Name }}-srv-{{ .Release.Namespace }}.{{ .Values.global.domain }}";
const MTA_BASE_URL = "~{srv-api/srv-url}";

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

    const enhanceModel = require("../csn-enhancements");
    enhanceModel(csn);

    const project = readProject();

    if (project.hasMta) {
      await this._updateMtaConfig(csn, project);
    }

    if (project.hasHelm) {
      await this._updateHelmConfig(csn);
    }

    if (cds.env.requires.db?.kind === "hana") {
      this._verifyHANAAccessRestrictions();
    }

    this.messages.push(...cds._dpi.buildMessages);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MTA Configuration
  // ─────────────────────────────────────────────────────────────────────────────

  async _updateMtaConfig(csn, project) {
    try {
      const mtaContent = await fs.readFile(path.join(cds.root, "mta.yaml"), "utf-8");
      const mta = cds.parse.yaml(mtaContent);

      const dpiRetentionInstance = mta.resources?.find(
        (r) =>
          r.parameters?.service === "data-privacy-integration-service" &&
          r.parameters?.config?.dataPrivacyConfiguration?.configType === "retention"
      );

      if (!dpiRetentionInstance) return;

      const { dataSubjectRoles, organizationAttributes } = this._extractRetentionData(csn, false);

      this._warnOutdatedOrgAttributes(dpiRetentionInstance, organizationAttributes);

      await merge({
        resources: [{
          name: dpiRetentionInstance.name,
          parameters: {
            config: {
              dataPrivacyConfiguration: {
                retentionConfiguration: {
                  ...(dataSubjectRoles.length && { dataSubjectRoles }),
                  ...(organizationAttributes.length && { organizationAttributes })
                }
              }
            }
          }
        }]
      }).into("mta.yaml", {
        project,
        additions: [
          { in: "resources", where: { name: dpiRetentionInstance.name } },
          ...dataSubjectRoles.map((dsr) => ({
            in: "parameters.config.dataPrivacyConfiguration.retentionConfiguration.dataSubjectRoles",
            where: { dataSubjectRoleName: dsr.dataSubjectRoleName }
          })),
          ...organizationAttributes.map((attr) => ({
            in: "parameters.config.dataPrivacyConfiguration.retentionConfiguration.organizationAttributes",
            where: { organizationAttributeName: attr.organizationAttributeName }
          }))
        ]
      });
    } catch (err) {
      this._error(`Error updating MTA config: ${err.message}`);
    }
  }

  _warnOutdatedOrgAttributes(dpiRetentionInstance, newAttributes) {
    const existingAttributes =
      dpiRetentionInstance.parameters?.config?.dataPrivacyConfiguration?.retentionConfiguration?.organizationAttributes;

    if (!existingAttributes?.length) return;

    const newNames = new Set(newAttributes.map((a) => a.organizationAttributeName));
    const outdated = existingAttributes.filter((a) => !newNames.has(a.organizationAttributeName));

    for (const attr of outdated) {
      this._warn(
        `Deployment configuration contains outdated organizational attribute "${attr.organizationAttributeName}". Remove it if no longer needed.`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helm Configuration
  // ─────────────────────────────────────────────────────────────────────────────

  async _updateHelmConfig(csn) {
    // Try gen/chart first (build output), then chart/ (source)
    const genValuesPath = path.join(cds.root, "gen/chart/values.yaml");
    const srcValuesPath = path.join(cds.root, "chart/values.yaml");

    let valuesPath;
    if (fsSync.existsSync(genValuesPath)) {
      valuesPath = genValuesPath;
    } else if (fsSync.existsSync(srcValuesPath)) {
      valuesPath = srcValuesPath;
    } else {
      // Neither exists - skip silently, helm chart may not be configured
      return;
    }

    try {
      const { dataSubjectRoles, organizationAttributes } = this._extractRetentionData(csn, true);

      await merge({
        retention: {
          parameters: {
            dataPrivacyConfiguration: {
              retentionConfiguration: {
                dataSubjectRoles,
                organizationAttributes
              }
            }
          }
        }
      }).into(valuesPath);

      this._info("Updated Helm chart with DPI retention configuration");
    } catch (err) {
      this._error(`Error updating Helm config: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Data Extraction (shared between MTA and Helm)
  // ─────────────────────────────────────────────────────────────────────────────

  _extractRetentionData(csn, isHelm) {
    const retentionService = csn.definitions["sap.ilm.RetentionService"];
    const dataSubjects = retentionService?._dpi?.dataSubjects || {};

    if (!Object.keys(dataSubjects).length) {
      this._error(
        "No data subject defined. Add @PersonalData.EntitySemantics: 'DataSubject' to at least one entity."
      );
    }

    return {
      dataSubjectRoles: this._buildDataSubjectRoles(dataSubjects, csn, isHelm),
      organizationAttributes: this._buildOrganizationAttributes(csn, isHelm)
    };
  }

  _buildDataSubjectRoles(dataSubjects, csn, isHelm) {
    const roles = [];

    for (const [name, entity] of Object.entries(dataSubjects)) {
      const roleAnnotation = entity["@PersonalData.DataSubjectRole"];

      if (typeof roleAnnotation === "string") {
        roles.push(this._formatDataSubject(roleAnnotation, entity, csn, isHelm));
      } else if (roleAnnotation?.["="]) {
        const enumDef = entity.elements[roleAnnotation["="]]?.enum;
        if (enumDef) {
          for (const role of Object.keys(enumDef)) {
            roles.push(this._formatDataSubject(role, entity, csn, isHelm));
          }
        } else {
          this._error(
            `Dynamic data subject "${name}" requires an enum for property "${roleAnnotation["="]}".`
          );
        }
      }
    }

    return roles;
  }

  _formatDataSubject(role, entity, csn, isHelm) {
    const servicePath =
      csn.definitions["sap.ilm.RetentionService"].path ??
      csn.definitions["sap.ilm.RetentionService"]["@path"];

    const baseURL = isHelm ? K8S_BASE_URL : MTA_BASE_URL;

    const result = {
      dataSubjectRoleName: role,
      dataSubjectDescription: getTranslationKey(entity["@Core.Description"]) ?? cds.i18n.labels.for(entity) ?? role,
      dataSubjectBaseURL: baseURL,
      dataSubjectBlockingEndPoint: `${servicePath}/dataSubjectBlocking`,
      dataSubjectInformationEndPoint: `${servicePath}/dataSubjectInformation`,
      dataSubjectsDestroyingEndPoint: `${servicePath}/dataSubjectsDestroying`
    };

    const descriptionKey = getTranslationKey(entity["@Core.Description"] || cds.i18n.labels.key4(entity));
    if (descriptionKey) {
      result.dataSubjectDescriptionKey = descriptionKey;
    }

    return result;
  }

  _buildOrganizationAttributes(csn, isHelm) {
    const baseURL = isHelm ? K8S_BASE_URL : MTA_BASE_URL;

    return Object.entries(csn.definitions)
      .filter(([name]) => name.startsWith("sap.ilm.RetentionService.valueHelp_orgAttribute"))
      .map(([, def]) => {
        const result = {
          organizationAttributeName: def["@ILM.OrganizationAttributeName"],
          organizationAttributeDescription: cds.i18n.labels.for(def) ?? cds.i18n.labels.key4(def),
          organizationAttributeBaseURL: baseURL,
          organizationAttributeValueHelpEndPoint: def["@ILM.ValueHelp.Path"]
        };

        const descriptionKey = getTranslationKey(def["@Common.Label"]);
        if (descriptionKey) {
          result.organizationAttributeDescriptionKey = descriptionKey;
        }

        return result;
      });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HANA Verification
  // ─────────────────────────────────────────────────────────────────────────────

  _verifyHANAAccessRestrictions() {
    const undeployPath = path.join(cds.root, "db/undeploy.json");
    const roleFilePath = path.join(cds.root, "db/src/defaults/default_access_role.hdbrole");

    if (fsSync.existsSync(undeployPath)) {
      try {
        const config = JSON.parse(fsSync.readFileSync(undeployPath, "utf-8"));
        if (!config.some((p) => p.endsWith("hdbanalyticprivilege"))) {
          this._warn(
            '"undeploy.json" missing ".hdbanalyticprivilege" entry. This may cause issues with DPI analytics privileges.'
          );
        }
      } catch {
        // Ignore parse errors
      }
    }

    if (!fsSync.existsSync(roleFilePath)) {
      this._warn(
        '"db/src/defaults/default_access_role.hdbrole" missing. Run "cds add data-privacy" to generate it.'
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Logging helpers
  // ─────────────────────────────────────────────────────────────────────────────

  _error(message) {
    this.pushMessage(message, cds.build.Plugin.ERROR);
  }

  _warn(message) {
    this.pushMessage(message, cds.build.Plugin.WARNING);
  }

  _info(message) {
    this.pushMessage(message, cds.build.Plugin.INFO);
  }
};
