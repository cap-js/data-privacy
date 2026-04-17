const cds = require("@sap/cds-dk"); //> load from cds-dk
const { path } = cds.utils;
const fs = require("fs/promises");
const { readProject, merge, registries } = cds.add;
const { srv4 } = registries.mta;

const log = cds.log("data-privacy");

module.exports = class extends cds.add.Plugin {
  async run() { }

  async combine() {
    const project = readProject();
    const { hasMta, hasXsuaa, hasHana, srvPath } = project;

    if (hasHana) {
      const hdbAnalyticPrivileges = [
        "src/gen/**/*.hdbanalyticprivilege",
        "src/**/*.hdbanalyticprivilege"
      ];
      await merge(hdbAnalyticPrivileges).into("db/undeploy.json");
      log.debug(`Adding file suffix ".hdbanalyticprivilege" to ./db/undeploy.json.`);
    }

    if (hasMta) {
      const srv = srv4(srvPath); // Node.js or Java server module
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
      await merge(__dirname, "files/mta.yaml.hbs").into("mta.yaml", {
        project, // for Mustache replacements
        additions: [srv, dpiInfo, xsuaa],
        relationships: [
          {
            insert: [dpiInfo, "name"],
            into: [srv, "requires", "name"]
          }
        ]
      });
      //Two merge functions needed because relationships even if an array, can only handle the first relationship for a into target and not multiple ones
      await merge(__dirname, "files/mta.yaml.hbs").into("mta.yaml", {
        project, // for Mustache replacements
        additions: [srv, dpiRetention, xsuaa],
        relationships: [
          {
            insert: [dpiRetention, "name"],
            into: [srv, "requires", "name"]
          }
        ]
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
