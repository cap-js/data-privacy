[![REUSE status](https://api.reuse.software/badge/github.com/cap-js/data-privacy)](https://api.reuse.software/info/github.com/cap-js/data-privacy)

# CDS plugin for SAP Data Privacy Integration

## About this project

The `@cap-js/data-privacy` plugin provides an out of box integration for CAP based applications with the [SAP Data Privacy Integration (DPI) service](https://www.sap.com/products/technology-platform/data-privacy-integration.html).

In particular based on [`@PersonalData`](https://sap.github.io/odata-vocabularies/vocabularies/PersonalData.html) and [`@ILM`](https://sap.github.io/odata-vocabularies/vocabularies/ILM.html) annotations in the data model, the plugin automatically provides a `/dpp/information` endpoint and a `/dpp/retention` endpoint via which the SAP DPI service can request personal data to show it in its `Manage Personal Data` app and block and delete data based on retention rules defined in SAP DPI.

More information about how to use the plugin, can be found in the [Data Privacy guide](https://cap.cloud.sap/docs/guides/security/data-privacy).

## Requirements and Setup

Using this plugin requires a valid subscription of the [SAP Data Privacy Integration (DPI) service](https://www.sap.com/products/technology-platform/data-privacy-integration.html).

## Test the plugin locally

In `tests/bookshop-app/` you can find a sample application that is used to demonstrate how to use the plugin and to run tests against it.

### Local Testing

To execute local tests, simply run:

```bash
npm run test
```

For tests, the `cds-test` Plugin is used to spin up the application. More information about `cds-test` can be found [here](https://cap.cloud.sap/docs/node.js/cds-test).

## Support, Feedback, Contributing

This project is open to feature requests/suggestions, bug reports etc. via [GitHub issues](https://github.com/cap-js/data-privacy/issues). Contribution and feedback are encouraged and always welcome. For more information about how to contribute, the project structure, as well as additional contribution information, see our [Contribution Guidelines](CONTRIBUTING.md).

## Security / Disclosure

If you find any bug that may be a security problem, please follow our instructions [in our security policy](https://github.com/cap-js/data-privacy/security/policy) on how to report it. Please do not create GitHub issues for security-related doubts or problems.

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](https://github.com/cap-js/.github/blob/main/CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright 2026 SAP SE or an SAP affiliate company and data-privacy contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/cap-js/data-privacy).
