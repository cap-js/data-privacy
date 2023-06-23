# @sap/cds-dpi

- PDM = SAP Personal Data Manager
- DRM = SAP Data Retention Manager

## How to use @sap/cds-dpi

1. Add `@sap/cds-dpi` to your dependencies. Currently the package is only on the internal nexus, hence a `.npmrc` file in your project folder is required with the line `@sap:registry=https://int.repositories.cloud.sap/artifactory/api/npm/build-milestones-npm/` to specify that all `@sap` packages should be downloaded from the internal nexus.

2. You enabled the out of box SAP DRM & PDM integration support. 🎉

### Details

- This plugin is currently in beta state
- It automatically adds a DRM service to your CAP application, which serves all DRM endpoints generically based on your privacy annotations. Those are currently explained in: https://github.tools.sap/cap/dev/issues/177#issuecomment-2232113
- It automatically adds a PDM service to your CAP application, whic serves as a generic PDM endpoint. All PersonalData entities are added, including compositions. If you have a service called `PDMService` or served at `/pdm` the service is not created and the package just adds the entities, it misses in the service.
- Views / Projections / Selections are currently not considered when generating DRM and PDM services. Only "table" entities, which are annotated, are considered
- In addition to the annotations you need to configure your drm service instance in a proper way. Either do that manually or just add the task `{ "use": "@sap/cds-dpi", "src": "srv" }` to cds build. However you anyways need the task for the service, to generate the required HANA artifacts for production.
```
"cds": {
  "build": {
    "tasks": [
      { "use": "@sap/cds-dpi", "src": "srv" },
      { "for": "nodejs" },
      { "for": "hana" }
    ]
  },
}
```
If you now run `cds build` the DRM & PDM configuration will be added to the `mta.yaml` file. Please run `cds build` manually before building your mta, as it is not yet tested, whether it also works, when ìt is included in the build steps of the mta itself.
- [Alpha] The build task also adds `@PersonalData` annotations to your entities, when you used `@Communication` to define a contact, phone number or email address - so no need anymore to define the same semantics twice. 🎉 - Currently however written to `gen/srv/srv/csn-dpi.json` and needs to be manually copied to ``gen/srv/srv/csn.json``

# Testing repo locally
After cloning the repo only run `npm install --omit=dev --omit=peer` init to avoid issues with the `cds` dependency.

# Troubleshooting

## Package does not load
If upon server startup you do not see the message `[cds] - loaded plugin: { impl: '@sap/cds-dpi/cds-plugin' }`, please add  
```
"plugins": [
    "./node_modules/@sap/cds-opentelemetry/cds-plugin"
]
```
to your cds configuration, like:

```
cds : {
  ...,
  "plugins": [
    "./node_modules/@sap/cds-dpi/cds-plugin"
  ],
  ...
}
```
This ensures that the plugin is loaded, when it is not automatically detected.

## To many HDB artifacts

To resolve the entity hierarchy for the PDM service, the plugin relies on back links to the parent entity to get all required data privacy related fields. When a child does not have a backlink, e.g. an association back to the parent, the plugin uses intermediate views to create those backlinks. This results in more HDB artifacts.