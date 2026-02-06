const cds = require('@sap/cds-dk'); //> load from cds-dk
const { readProject, merge, registries } = cds.add;
const { srv4 } = registries.mta;
const log = cds.log('data-privacy');
const fs = require('fs/promises');
const { path } = cds.utils;


module.exports = class extends cds.add.Plugin {
  async run() {


    const project = readProject();

    let package_json = path.join(cds.root, 'package.json');
    let { appName } = require(package_json);
    let packageJsonContent = await fs.readFile(package_json, 'utf8');

    packageJsonContent = JSON.parse(packageJsonContent);
    // Modify the package.json content to add data-privacy configuration
    if (!packageJsonContent.cds) {
      packageJsonContent.cds = {};
    }
    if (!packageJsonContent.cds.requires) {
      packageJsonContent.cds.requires = {};
    }


    if (!packageJsonContent.cds.requires['sap.dpp.RetentionService']) {
      packageJsonContent.cds.requires['sap.dpp.RetentionService'] = {
        kind: 'TableHeaderBlocking',
        tableRestrictions: 'srv',
        applicationName: project.appName
      };
    } else {
      if (!packageJsonContent.cds.requires['sap.dpp.RetentionService'].applicationName) {
        packageJsonContent.cds.requires['sap.dpp.RetentionService'].applicationName = project.appName;
      }
    }
    if (!packageJsonContent.cds.requires['sap.dpp.InformationService']) {
      packageJsonContent.cds.requires['sap.dpp.InformationService'] = {
        model: '@sap/cds-dpi/srv/DPIInformation',
      };
    }
    if (!packageJsonContent.cds.requires['kinds']) {
      packageJsonContent.cds.requires['kinds'] = {};
    }
    if (!packageJsonContent.cds.requires['kinds']['sap.dpp.RetentionService-TableHeader']) {
      packageJsonContent.cds.requires['kinds']['sap.dpp.RetentionService-TableHeader'] = {
        impl: '@sap/cds-dpi/srv/TableHeaderBlocking',
        model: '@sap/cds-dpi/srv/TableHeaderBlocking',
      };
    }
    // Write back the modified package.json
    await fs.writeFile(package_json, JSON.stringify(packageJsonContent, null, 2), 'utf8');
    log.info('package.json enhanced with data-privacy configuration.');


    //update xs-security.json
    const xsSecurityPath = path.join(cds.root, 'xs-security.json');
    let xsSecurityContent = await fs.readFile(xsSecurityPath, 'utf8');

    xsSecurityContent = JSON.parse(xsSecurityContent);

    // Modify the xs-security.json content to add data-privacy configuration
    if (!xsSecurityContent.scopes) {
      xsSecurityContent.scopes = [];
      xsSecurityContent.xsappname = `${appName}-auth`;
      xsSecurityContent['tenant-mode'] = 'dedicated';
    }

    const scopeNames = xsSecurityContent.scopes.map((scope) => scope.name);
    if (!scopeNames.includes('$XSAPPNAME.PersonalDataManagerUser')) {
      xsSecurityContent.scopes.push({
        name: '$XSAPPNAME.PersonalDataManagerUser',
        description: 'Technical scope to restrict access to information endpoint',
        'grant-as-authority-to-apps': [`$XSSERVICENAME(${appName}-information)`],
      });
    }

    if (!scopeNames.includes('$XSAPPNAME.DataRetentionManagerUser')) {
      xsSecurityContent.scopes.push({
        name: '$XSAPPNAME.DataRetentionManagerUser',
        description: 'Technical scope to restrict access to retention endpoint',
        'grant-as-authority-to-apps': [`$XSSERVICENAME(${appName}-retention)`],
      });
    }

    // Write back the modified xs-security.json
    await fs.writeFile(xsSecurityPath, JSON.stringify(xsSecurityContent, null, 2), 'utf8');
    log.info('xs-security.json enhanced with data-privacy configuration.');




  }

  async combine() {
    const project = readProject();
    const { hasMta, srvPath } = project;

    if (hasMta) {
      const srv = srv4(srvPath); // Node.js or Java server module

      //--- add iEoP configuration ----
      //load model and check if oid and object type annotations are present
      /*
      let csn = await cds.compile('*');
      let objectType = null;


      const retentionEntities = Object.values(csn.definitions).filter(
        (d) => d['@PersonalData.EntitySemantics'] === 'DataSubject'
      );
      let hasIEoP = false;
      for (const entity of retentionEntities) {
        if (entity['@ODM.entityName'] && entity['@ODM.oid']) {
          objectType = entity['@ODM.entityName'];
          hasIEoP = true;
          break;
        }
      }

      if (!hasIEoP) {
        log.info('No entities with @ODM.entityName and @ODM.oid found. iEoP configuration will not be added to mta.yaml');
        return;
      }

      //Update configuration in mta.yaml for iEoP
      const iEoPConfig = {
        in: `parameters.config.dataPrivacyConfiguration.retentionConfiguration.iEoPConfiguration.applicationConfiguration`,

        where: {
          objectType: objectType
        }

      };


      await merge(__dirname, 'add/mta.yaml.hbs').into('mta.yaml', {
        project,
        additions: [iEoPConfig]
      });*/


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

      // --- Add dpi information resource --- 
      await merge(__dirname, 'add/mta.yaml.hbs').into('mta.yaml', {
        project, // for Mustache replacements
        additions: [srv, dpiInfo],
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
        additions: [srv, dpiRetention],
        relationships: [
          {
            insert: [dpiRetention, 'name'],
            into: [srv, 'requires', 'name'],
          },
        ],
      });

      // --- Add auditlog resource ---
      const auditlog = {
        in: 'resources',
        where: { 'parameters.service': 'auditlog' },
        name: `${project.appName}-auditlog`,
        type: 'org.cloudfoundry.managed-service',
        parameters: {
          "service": 'auditlog',
          "service-plan": 'standard',
          "service-name": `${project.appName}-auditlog`
        }
      }

      // --- Add authorization resource ---
      const authorization = {
        in: 'resources',
        where: { 'parameters.service': 'xsuaa' },
        name: `${project.appName}-auth`,
        parameters: {
          config: {
            scopes: [
              {
                name: `$XSAPPNAME.PersonalDataManagerUser`,
                description: 'Technical scope to restrict access to information endpoint',
                'grant-as-authority-to-apps': [
                  `$XSSERVICENAME(${project.appName}-information)`
                ]
              },
              {
                name: `$XSAPPNAME.DataRetentionManagerUser`,
                description: 'Technical scope to restrict access to retention endpoint',
                'grant-as-authority-to-apps': [
                  `$XSSERVICENAME(${project.appName}-retention)`
                ]
              }
            ],
            xsappname: `${project.appName}-${project.org}-${project.space}`,
            'tenant-mode': 'dedicated',
            'service-plan': 'application',
            path: './xs-security.json'
          }

        }
      };

      // --- First merge to add authorization and auditlog resources ---  
      await merge(__dirname, 'add/mta.yaml.hbs').into('mta.yaml', {
        project,
        additions: [authorization, auditlog],
        relationships: [
          {
            insert: [authorization, 'name'],
            into: [srv, 'requires', 'name'],
          },

          {
            insert: [auditlog, 'name'],
            into: [srv, 'requires', 'name'],
          }

        ]
      });

      // if (hasHelm) {
      //  ...
      // if (hasMultitenancy) {
      //  ...
    }
  }
};
