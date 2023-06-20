# @sap/cds-dpi

## Include @sap/cds-dpi

1. Add `@sap/cds-dpi` to your dependencies. Currently the package is only on the internal nexus, hence a `.npmrc` file in your project folder is required with the line `@sap:registry=https://int.repositories.cloud.sap/artifactory/api/npm/build-milestones-npm/` to specify that all `@sap` packages should be downloaded from the internal nexus.

2. If upon server startup you do not see the message `[cds] - loaded plugin: { impl: '@sap/cds-dpi/cds-plugin' }`, please add  
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
This ensures that the plugin is loaded.

3. You enabled the out of box SAP DRM integration support. 🎉

### Details

- This plugin is currently in beta state
- It automatically adds a DRM service to your CAP application, which serves all DRM endpoints generically based on your privacy annotations. Those are currently explained in: https://github.tools.sap/cap/dev/issues/177#issuecomment-2232113
- In addition to the annotations you need to configure your drm service instance in a proper way. An example can be: https://github.tools.sap/cap/drm-test/blob/main/gdpr/.drm/drm-app-config-dynamic.json

# Testing repo locally
After cloning the repo only run `npm install --omit=dev --omit=peer` init to avoid issues with the `cds` dependency.