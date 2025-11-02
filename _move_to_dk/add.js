const cds = require('@sap/cds-dk') //> load from cds-dk
const { readProject, merge, registries } = cds.add
const { srv4 } = registries.mta

const log = cds.log('data-privacy');
const yaml = require('@sap/cds-foss').yaml
const fs = require('fs/promises');
const fsSync = require('fs');
const { path } = cds.utils;

module.exports = class extends cds.add.Plugin {
  async run() {

    const { isJava } = readProject()
    const { mvn } = cds.add

    // Create drm/sidecar folder in the root repository and copy package.json template
    const root = process.cwd();
    const sidecarFolder = path.join(root, 'data-privacy', 'sidecar');
    const sidecarFolderSrv = path.join(sidecarFolder, 'srv');


    // Ensure data-privacy/sidecar exists
    await fs.mkdir(sidecarFolder, { recursive: true });
    await fs.mkdir(sidecarFolderSrv, { recursive: true });

    // Copy the template package.json file
    const processPath = process.cwd();

    let package_json = path.join(cds.root, 'package.json');
    let { appName, description } = require(package_json);

    const packageJsonTemplate = path.join(__dirname, 'templates', 'sidecar-package.json');

    // Read the template package.json
    let packageJsonContent = await fs.readFile(packageJsonTemplate, 'utf8');
    // Replace placeholder with actual app name
    packageJsonContent = packageJsonContent.replace(/"APP_NAME_PLACEHOLDER"/g, `"${appName}"`);


    // Write the modified content to the target location
    const packageJsonTarget = path.join(processPath, 'data-privacy', 'sidecar', 'package.json');
    if (!fsSync.existsSync(packageJsonTarget)) {
      await fs.writeFile(packageJsonTarget, packageJsonContent, 'utf8');
      log.info('Template package.json copied and modified successfully.');
    } else {
      log.info('Target package.json already exists. Skipping copy.');
    }
  }

  async combine() {
    const project = readProject()
    const { hasMta, srvPath } = project

    if (hasMta) {
      const srv = srv4(srvPath) // Node.js or Java server module
      const dpiInfo = {
        in: 'resources',
        where: {
          'parameters.service': 'data-privacy-integration-service',
          'parameters.config.dataPrivacyConfiguration.configType': 'information'
        }
      }
      const dpiRetention = {
        in: 'resources',
        where: {
          'parameters.service': 'data-privacy-integration-service',
          'parameters.config.dataPrivacyConfiguration.configType': 'retention'
        }
      }
      const xsuaa = {
        in: 'resources',
        where: { 'parameters.service': 'xsuaa' }
      }
      await merge(__dirname, 'add/mta.yaml.hbs').into('mta.yaml', {
        project, // for Mustache replacements
        additions: [srv, dpiInfo, xsuaa],
        relationships: [{
          insert: [dpiInfo, 'name'],
          into: [srv, 'requires', 'name']
        }]
      })
      //Two merge functions needed because relationships even if an array, can only handle the first relationship for a into target and not multiple ones
      await merge(__dirname, 'add/mta.yaml.hbs').into('mta.yaml', {
        project, // for Mustache replacements
        additions: [srv, dpiRetention, xsuaa],
        relationships: [{
          insert: [dpiRetention, 'name'],
          into: [srv, 'requires', 'name']
        }]
      })
    }
    // if (hasHelm) {
    //  ...
    // if (hasMultitenancy) {
    //  ...
  }
}