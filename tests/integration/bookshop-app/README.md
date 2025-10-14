# DRM Test
Example app to test [`@sap/cds-dpi`](https://github.tools.sap/cap/cds-dpi) package.

Important files are: db/schema.cds for test schema and db/data-privacy.cds for privacy related annotations.

There is no business service in the app to not clutter it up. When you start the app with `cds run --in-memory` you will see that PDM and DRM endpoints are served, even if they are not part of the srv/ folder, thanks to the package.

# Test for yourself

Prerequisites:
- You have completed the SAP Developer tutorial: [Deploy your application](https://developers.sap.com/group.btp-app-cap-deploy.html), e.g. have all the build & deploy tools installed
- You deploy to an enterprise account with enough quota for the services of the mta.yaml file.

1. git clone the repo
2. npm i
3. mbt build -t ./
4. cf deploy ./capire.gdpr_1.0.0.mtar

After deployment PDM should work out of box. For DRM there are still two manual steps required, which will get automated within the next few weeks. Those steps of the [Getting started](https://help.sap.com/docs/data-retention-manager/development/getting-started?locale=en-US) section of DRM are: Add env variable and register the tenant for DRM.     