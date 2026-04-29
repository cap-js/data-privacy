const cds = require("@sap/cds-dk"); //> load from cds-dk
const { path } = cds.utils;
const fs = require("fs/promises");
const { readProject, merge, registries } = cds.add;
const { srv4, mtxSidecar4 } = registries.mta;

const log = cds.log("data-privacy");

module.exports = class extends cds.add.Plugin {
  static help() {
    return "Data Privacy Integration services (information and retention)";
  }

  async run() {
    const project = readProject();

    // If Helm chart already exists, add DPI services now
    if (project.hasHelm) {
      await this._addHelmSupport(project);
    }
  }

  async combine() {
    const project = readProject();
    const { hasMta, hasXsuaa, hasHana, hasMultitenancy, isNodejs, isJava, srvPath } = project;

    // When running `cds add helm,data-privacy` or `cds add kyma,data-privacy` together
    // addKyma is only set when kyma template is being added in the same command
    if (cds.cli?.options?.add?.has?.("kyma") || cds.cli?.options?.add?.has?.("helm")) {
      await this._addHelmSupport(project);
    }

    if (hasHana) {
      const hdbAnalyticPrivileges = [
        "src/gen/**/*.hdbanalyticprivilege",
        "src/**/*.hdbanalyticprivilege"
      ];
      await merge(hdbAnalyticPrivileges).into("db/undeploy.json");
      log.debug(`Adding file suffix ".hdbanalyticprivilege" to ./db/undeploy.json.`);

      // Add default_access_role that restricts SELECT via DPP analytic privileges
      const defaultAccessRole = {
        role: {
          name: "default_access_role",
          pattern_escape_character: "/",
          schema_privileges: [
            {
              privileges: [
                // SELECT is added in via sap.ilm.RestrictBlockedDataAccess
                "INSERT",
                "UPDATE",
                "DELETE",
                "EXECUTE",
                "CREATE TEMPORARY TABLE",
                "SELECT CDS METADATA"
              ]
            }
          ],
          schema_roles: [
            {
              names: ["sap.ilm.RestrictBlockedDataAccess"]
            }
          ]
        }
      };
      const hdiconfig = {
        minimum_feature_version: "1000",
        file_suffixes: {
          hdbrole: {
            plugin_name: "com.sap.hana.di.role"
          }
        }
      };
      await merge(defaultAccessRole).into("db/src/defaults/default_access_role.hdbrole");
      await merge(hdiconfig).into("db/src/defaults/.hdiconfig");
      log.debug(`Adding default_access_role.hdbrole to ./db/src/defaults/.`);
    }

    if (hasMultitenancy) {
      // Add @cap-js/data-privacy dependency to sidecar
      await merge(__dirname, "files/package.sidecar.json").into("mtx/sidecar/package.json");
      if (isNodejs) {
        // Node.js: sidecar only needs CDS models, not HTTP endpoints
        await merge({
          cds: {
            requires: {
              "sap.dpp.InformationService": false,
              "sap.ilm.RetentionService": false
            }
          }
        }).into("mtx/sidecar/package.json");
      }
      log.debug(`Adding @cap-js/data-privacy to mtx/sidecar/package.json.`);
    }

    if (hasMta) {
      const srv = srv4(srvPath);
      const mtxSidecarPath = isJava ? "mtx/sidecar" : "gen/mtx/sidecar";
      const dpiInfo = {
        in: "resources",
        where: {
          "parameters.service": "data-privacy-integration-service",
          "parameters.config.dataPrivacyConfiguration.configType": "information"
        }
      };
      const dpiRetention = {
        in: "resources",
        where: {
          "parameters.service": "data-privacy-integration-service",
          "parameters.config.dataPrivacyConfiguration.configType": "retention"
        }
      };
      const xsuaa = {
        in: "resources",
        where: { "parameters.service": "xsuaa" }
      };

      // First merge: wire DPI information into srv
      const infoRelationships = [
        {
          insert: [dpiInfo, "name"],
          into: [srv, "requires", "name"]
        }
      ];
      if (hasMultitenancy) {
        const mtxSidecar = mtxSidecar4(mtxSidecarPath);
        infoRelationships.push({
          insert: [dpiInfo, "name"],
          into: [mtxSidecar, "requires", "name"]
        });
      }
      await merge(__dirname, "files/mta.yaml.hbs").into("mta.yaml", {
        project,
        additions: hasMultitenancy
          ? [srv, mtxSidecar4(mtxSidecarPath), dpiInfo, xsuaa]
          : [srv, dpiInfo, xsuaa],
        relationships: infoRelationships
      });

      // Second merge: wire DPI retention into srv (two merges needed — relationship limitation)
      const retentionRelationships = [
        {
          insert: [dpiRetention, "name"],
          into: [srv, "requires", "name"]
        }
      ];
      if (hasMultitenancy) {
        const mtxSidecar = mtxSidecar4(mtxSidecarPath);
        retentionRelationships.push({
          insert: [dpiRetention, "name"],
          into: [mtxSidecar, "requires", "name"]
        });
      }
      await merge(__dirname, "files/mta.yaml.hbs").into("mta.yaml", {
        project,
        additions: hasMultitenancy
          ? [srv, mtxSidecar4(mtxSidecarPath), dpiRetention, xsuaa]
          : [srv, dpiRetention, xsuaa],
        relationships: retentionRelationships
      });
    }

    if (hasXsuaa && hasMta) {
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
      const dpiInformationInstance = mta.resources.find(
        (r) =>
          r.parameters?.service === "data-privacy-integration-service" &&
          r.parameters?.config?.dataPrivacyConfiguration?.configType === "information"
      );

      const additions = [];
      if (dpiInformationInstance) {
        project["dpiInfo-service-name"] = dpiInformationInstance.name;
        additions.push({ in: "scopes", where: { name: "$XSAPPNAME.PersonalDataManagerUser" } });
        log.debug(`Adding PersonalDataManagerUser scopes to ./xs-security.json.`);
      }
      if (dpiRetentionInstance) {
        project["dpiRetention-service-name"] = dpiRetentionInstance.name;
        additions.push({ in: "scopes", where: { name: "$XSAPPNAME.DataRetentionManagerUser" } });
        log.debug(`Adding DataRetentionManagerUser scopes to ./xs-security.json.`);
      }
      await merge(__dirname, "files/xs-security.json.hbs").into("xs-security.json", {
        project,
        additions: additions
      });
    }
  }

  async _addHelmSupport(project) {
    const KymaTemplate = require("@sap/cds-dk/lib/init/template/kyma");

    // Add Chart.yaml dependencies
    await KymaTemplate.mergeDependency("service-instance", "information");
    await KymaTemplate.mergeDependency("service-instance", "retention");

    // Merge DPI service instances into values.yaml (no 'with' - preserve Helm {{ }} syntax)
    await merge(__dirname, "../init/template/data-privacy/files/values.yaml").into("chart/values.yaml");

    // Add srv bindings
    await merge({
      srv: {
        bindings: {
          information: { serviceInstanceName: "information" },
          retention: { serviceInstanceName: "retention" }
        }
      }
    }).into("chart/values.yaml", { with: project });

    // Add xsuaa scopes with grant-as-authority-to-apps
    // Use $XSSERVICENAME() to resolve to the full xsappname at runtime
    await merge({
      xsuaa: {
        parameters: {
          scopes: [
            {
              name: "$XSAPPNAME.PersonalDataManagerUser",
              description: "Technical scope to restrict access to information endpoint",
              "grant-as-authority-to-apps": ["$XSSERVICENAME({{ .Release.Name }}-information)"]
            },
            {
              name: "$XSAPPNAME.DataRetentionManagerUser",
              description: "Technical scope to restrict access to retention endpoint",
              "grant-as-authority-to-apps": ["$XSSERVICENAME({{ .Release.Name }}-retention)"]
            }
          ]
        }
      }
    }).into("chart/values.yaml", {
      with: project,
      additions: [
        { in: "xsuaa.parameters.scopes", where: { name: "$XSAPPNAME.PersonalDataManagerUser" } },
        { in: "xsuaa.parameters.scopes", where: { name: "$XSAPPNAME.DataRetentionManagerUser" } }
      ]
    });

    log.info("Added Data Privacy Integration services to Helm chart");
  }
};
