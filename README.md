# @sap/cds-dpi

> **Warning**
> @sap/cds-dpi is in active development and currently in **beta**. Please try it out and provide feedback, so that the release version later this year meets all kinds of requirements.

The CAP Node.js plugin adds out of box support for the SAP Personal Data Manager (PDM) and SAP Data Retention Manager (DRM).
You no longer have do define service endpoints anc configure these services, instead annotating your data model with the privacy annotations is sufficient, reducing the time you have to spend to fulfill [SAP Product Standards](https://pages.github.tools.sap/cap/docs/guides/data-privacy/introduction#sap-product-standards)

## How to use @sap/cds-dpi

1. Add `@sap/cds-dpi` to your dependencies. Currently the package is only on the internal nexus, hence a `.npmrc` file in your project folder is required with the line `@sap:registry=https://int.repositories.cloud.sap/artifactory/api/npm/build-milestones-npm/` to specify that all `@sap` packages should be downloaded from the internal nexus.
3. You enabled the out of box SAP DRM & PDM integration support. 🎉
4. Ideally when building the app with `cds build` you already get a warning or info, if required annotations for the DRM are missing.
5. If you encounter bugs or have feature proposals & ideas, please contact us / open a GitHub issue.

## Testing the package
You can use the repository https://github.tools.sap/cap/drm-test to quickly test the package and our example.

## Details

### Annotations

[Required]

1. Annotate your data model as outlined in the [capire cookbook Data Privacy basics](https://pages.github.tools.sap/cap/docs/guides/data-privacy/introduction)
2. In addition your data subject has to be annotated with `@Communication.Contact`. You need to specify the "n" property with "firstName" and "lastName" in combination with either "email" or "bday" (or both) for PDM. For DRM we can even offer further support: 
    - "prefix", "additional" and "suffix" of "n" are considered when displaying the data subject. 
    - If you define "@Communication.Contact.fn" it is used instead
    - Only "@Communication.Contact.n.surname" is expected
    - Email of type #preferred is preferred, else #home is used and if both types are not given, the first one is used. 
3. Your transactional entities, like Orders, require three property annotations: `@PersonalData.FieldSemantics: 'EndOfBusinessDate' | 'LegalEntityID' | 'DataSubjectID'`
4. Your LegalEntity, which is referred to by an association annotated with `@PersonalData.FieldSemantics: 'LegalEntityID'` requires the `@UI.HeaderInfo` annotation with the properties "TypeName", "Title", and "Description". Title and Descripton are the values we serve to DRM, hence the requirement.

[Optional]

5. Entities can be annotated with `@Core.Description or @description`. All properties should have a label (`@title` or `@Common.Label`)
6. DRM allows for conditions on fields in its rules. As they have to provide a source list of values, we offer all fields with `@Common.ValueList` annotation. If you have them for Fiori UIs, you won't have to adjust anything. The CollectionPath property is used to determine the source entity. And from the Parameters ValueListParameterInOut or ValueListParameterOut is used for the value and ValieListParameterDisplayOnly is used for the description. If you have defined multiple DisplayOnly parameter, we chain them together with a ',' to provide the same information to the DRM user.
7. For archiving and data deletion, the DRM also allows for data filtering. The following things are considered:
    - `@Capabilities.FilterRestrictions.Filterable` to toggle for the whole entity
    - Fields annotated with `@UI.HiddenFilter` or `@UI.Hidden` are not shown
    - Fields, which are not part of `@Capabilities.FilterRestrictions.NonFilterableProperties`
    - The field is not a key field and neither annotated with `@PersonalData.FieldSemantics: 'EndOfBusinessDate'`
    - `@UI.SelectionFields` is not defined or the field is part of it
    - `@Capabilities.FilterRestrictions.RequiredProperties` overrules all other previous points, expect the first.
    - **Remark** All filter fields should ususally also offer a value help by providing `@Common.ValueList` 
    - Only fields of the data types Integer, Decimal, Timestamp, String, Boolean are supported (DRM limitation). Integer, Decimal and Timestamp fields are treated as range fields - for those a range can be provided. If you want to change that you can use `@Capabilities.FilterRestrictions.FilterExpressionRestrictions` and add the property for which you want to change the behaviour and change the value of "AllowedExpressions" to 'SingleValue'. 'SingleRange' is the default for the range data types.
8. PDM interprets `@UI.LineItem` and `@UI.FieldGroup` to visualize transactional data of a data subject. If no annotation is given by the application, the package automatically adds both. The fields inside of the annotations are ordered by 
    1. Keys
    2. Semantic Keys
    3. End of business field
    4. Potentially sensitive fields
    5. Potentially personal fields
    6. All other fields. Fields of the managed aspect are moved to the end.

### Concept
You can read more about the concept in the backlog item: https://github.tools.sap/cap/dev/issues/177

### Configuration
- Currently you cannot disable the automatic addition of the services to your mta.yaml file.
- If you'd like to override the default implementation, you can just define your own `DPIInformationService` or `DPIRetentionService` and the plugin will only add the features, which you did not implement.
- Views / Projections / Selections are currently not considered when generating DRM and PDM services. Only "table" entities, which are annotated, are considered. If you have a use case, where this is not suitable, please reach out with an example! Thanks 😊

### Convenience feature for semantically same annotations
The build task also adds `@PersonalData` annotations to your entities, when you used `@Communication` to define a contact, phone number or email address - so no need anymore to define the same semantics twice. 🎉 - Currently however the resulting model is written to `gen/srv/srv/csn-dpi.json` and needs to be manually copied to ``gen/srv/srv/csn.json``

## Not yet implemented features
- i18n for DRM and PDM. The goal is that we provide out of box the i18n endpoints for both services and mash up the file based on the exposed entities and their annotations.
- Async deletion implementation for iLMObjects. The DRM services offers and endpoint for async deletion of iLMObjects, like Orders and similar transactional data, which still has to be implemented.
- MTX support
- In the current sample there is only one application, which is responsible for data subjects and transactional data. However reality is more complex. We plan to offer proper multi-service mashup support, so DRM still works, when the data subject is from a different application.
- Testing is still in progress 

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