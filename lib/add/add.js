const cds = require("@sap/cds-dk"); //> load from cds-dk
const { path } = cds.utils;
const fs = require("fs/promises");
const { readProject, merge, registries } = cds.add;
const { srv4, mtxSidecar4 } = registries.mta;

const log = cds.log("data-privacy");

module.exports = class extends cds.add.Plugin {
  async run() { }

  async combine() {
    const project = readProject();
    const { hasMta, hasXsuaa, hasHana, hasMultitenancy, isNodejs, isJava, srvPath } = project;

    if (hasHana) {
      const hdbAnalyticPrivileges = [
        "src/gen/**/*.hdbanalyticprivilege",
        "src/**/*.hdbanalyticprivilege"
      ];
      await merge(hdbAnalyticPrivileges).into("db/undeploy.json");
      log.debug(`Adding file suffix ".hdbanalyticprivilege" to ./db/undeploy.json.`);
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
      
      const additions = []
      if (dpiInformationInstance) {
        project['dpiInfo-service-name'] = dpiInformationInstance.name;
        additions.push({ in: 'scopes', where: { name: '$XSAPPNAME.PersonalDataManagerUser' } })
        log.debug(`Adding PersonalDataManagerUser scopes to ./xs-security.json.`);
      }
      if (dpiRetentionInstance) {
        project['dpiRetention-service-name'] = dpiRetentionInstance.name
        additions.push({ in: 'scopes', where: { name: '$XSAPPNAME.DataRetentionManagerUser' } })
        log.debug(`Adding DataRetentionManagerUser scopes to ./xs-security.json.`);
      }
      await merge(__dirname, 'files/xs-security.json.hbs').into('xs-security.json', {
        project,
        additions: additions
      })
    }
  }
};
