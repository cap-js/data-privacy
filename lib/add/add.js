const cds = require('@sap/cds-dk'); //> load from cds-dk
const { readProject, merge, registries } = cds.add;
const { srv4 } = registries.mta;

const log = cds.log('data-privacy');

module.exports = class extends cds.add.Plugin {
  async run() {
    // const { isJava } = readProject()
    // const { mvn } = cds.add
    // TODO: Add hdbanalyticprivilege to undeploy.json
  }

  async combine() {
    const project = readProject();
    const { hasMta, hasHana, srvPath } = project;

    if (hasHana) {
      const hdbAnalyticPrivileges = [
        'src/gen/**/*.hdbanalyticprivilege',
        'src/**/*.hdbanalyticprivilege',
      ];
      await merge(hdbAnalyticPrivileges).into('db/undeploy.json');
      log.debug(`Adding file suffix ".hdbanalyticprivilege" to ./db/undeploy.json.`);
    }
    if (hasMta) {
      const srv = srv4(srvPath); // Node.js or Java server module
      const dpiInfo = {
        in: 'resources',
        where: {
          'parameters.service': 'data-privacy-integration-service',
          'parameters.config.dataPrivacyConfiguration.configType': 'information',
        },
      };
      const dpiRetention = {
        in: 'resources',
        where: {
          'parameters.service': 'data-privacy-integration-service',
          'parameters.config.dataPrivacyConfiguration.configType': 'retention',
        },
      };
      const xsuaa = {
        in: 'resources',
        where: { 'parameters.service': 'xsuaa' },
      };
      await merge(__dirname, 'add/mta.yaml.hbs').into('mta.yaml', {
        project, // for Mustache replacements
        additions: [srv, dpiInfo, xsuaa],
        relationships: [
          {
            insert: [dpiInfo, 'name'],
            into: [srv, 'requires', 'name'],
          },
        ],
      });
      //Two merge functions needed because relationships even if an array, can only handle the first relationship for a into target and not multiple ones
      await merge(__dirname, 'add/mta.yaml.hbs').into('mta.yaml', {
        project, // for Mustache replacements
        additions: [srv, dpiRetention, xsuaa],
        relationships: [
          {
            insert: [dpiRetention, 'name'],
            into: [srv, 'requires', 'name'],
          },
        ],
      });
    }
    // if (hasHelm) {
    //  ...
    // TODO: In case it is JAVA generate sidecar and add DPI
    // - Then also DPI instances must be bound against that sidecar
    // - Sidecar must be added to mta
    // if (isJava) {

    // }
  }
};
