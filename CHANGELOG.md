# Change Log

- All notable changes to this project are documented in this file.
- The format is based on [Keep a Changelog](https://keepachangelog.com/).
- This project adheres to [Semantic Versioning](https://semver.org/).

## Version 0.6.0 - 18.04.2026

### Added
- Added `cds add data-privacy` command, which adds the necessary configuration. Currently only works with MTA & XSUAA.

### Fixed
- Fixed multiple issues regarding MTXs model handling

## Version 0.5.0 - 15.04.2026

### Added

#### Retention Management (`sap.ilm.RetentionService`)

- Provide the `sap.ilm.RetentionService` as a REST service at `/dpp/retention`, requiring the `DataRetentionManagerUser` role, to integrate with the SAP Data Privacy Integration NG (DPI) Retention Management module.
- Automatically generate the retention service interface from CDS models annotated with `@PersonalData.EntitySemantics` and related annotations.
- Support ILM Object discovery via `GET /dpp/retention/iLMObjects`, returning metadata including object names, reference dates, organizational attributes, conditions, and data subject roles.
- Support blocking of ILM object instances and their compositions via `dataSubjectILMObjectInstanceBlocking`, setting `dppBlockingDate` and destruction dates recursively through the entire composition hierarchy.
- Support blocking of data subject master data via `dataSubjectBlocking`, with validation that no active ILM object instances remain.
- Support destruction (deletion) of ILM object instances via `dataSubjectsILMObjectInstancesDestroying` when the earliest destruction date has passed.
- Support destruction of data subjects via `dataSubjectsDestroying` when the earliest destruction date has passed and no active ILM object instances remain.
- Support end-of-business checks via `dataSubjectEndOfBusiness` to determine whether all business for a data subject is concluded.
- Support end-of-residence evaluation via `dataSubjectsEndOfResidence` and `dataSubjectsEndOfResidenceConfirmation` to identify data subjects eligible for blocking based on retention sets and residence periods.
- Support retrieval of latest retention start dates via `dataSubjectLatestRetentionStartDates` per retention set, including condition-based filtering.
- Support retrieval of organizational attribute values for a data subject via `dataSubjectOrganizationAttributeValues`.
- Support retrieval of data subject display information (name and email) via `dataSubjectInformation`, derived from `@Communication.Contact` annotations.
- Support async callback handling for blocking status updates via `dataSubjectBlockingAsyncCallback`.
- Support `@ILM.ObjectName` to customize the ILM object name exposed to the DPI service. The default remains the entity name.
- Support i18n in DPI UIs

#### Organizational Attributes & Value Help

- Automatically generate value help endpoints for organizational attributes annotated with `@PersonalData.FieldSemantics: 'DataControllerID'` or `@ILM.FieldSemantics: 'LineOrganizationID'`.
- Support three resolution strategies for organizational attribute value help: `@Common.ValueList` annotation, association target with `@Common.Text` or `@UI.HeaderInfo.Title.Value`, or `SELECT DISTINCT` fallback.
- Automatically generate value help endpoints for condition fields annotated with `@PersonalData.FieldSemantics: 'PurposeID'` or `@ILM.FieldSemantics: 'ProcessOrganizationID'`.

#### Blocking & Destruction Aspects

- Automatically inject `sap.ilm.blocking` (with `dppBlockingDate`) and `sap.ilm.destruction` (with `ilmEarliestDestructionDate`, `ilmLatestDestructionDate`) aspects into ILM Objects, Data Subjects, and their composed entities.
- Support brownfield scenarios where existing fields are annotated with `@PersonalData.FieldSemantics: 'BlockingDate'` or `@PersonalData.FieldSemantics: 'EndOfRetentionDate'`, skipping injection of the respective aspect fields.

#### Access Restrictions for Blocked Data

- Restrict access to blocked data at the application layer (default) by injecting `WHERE` clauses into all CQN queries against ILM-relevant base entities, filtering out records where `blockingDate` is set and in the past.
- Skip application-layer restrictions for privileged CAP users (`_is_privileged`), allowing internal service-to-service calls to access all data.
- Support `tableRestrictions: "db"` configuration to strip HDI user schema SELECT privileges on ILM-relevant tables, enforcing restrictions at the database level.
- Generate HANA Cloud Analytic Privileges (`.hdbanalyticprivilege`) for each view over ILM-relevant tables, restricting access based on the `dppBlockingDate` column.
- Generate `sap.ilm.RestrictBlockedDataAccess` HANA role collecting all view-level analytic privileges and assigned to the `default_access_role`.
- Generate `sap.ilm.DPPNoRestrictions` HANA role granting unrestricted access to all views for support scenarios.
- Annotate HANA views with `@sql.append: 'WITH STRUCTURED PRIVILEGE CHECK'` for analytic privilege enforcement.
- Set and clear `SESSION_CONTEXT('ROLES')` around database requests on HANA to enable role-based analytic privilege evaluation.

#### Auditor Access

- Grant auditors access to blocked data by default via the `Auditor` role (XSUAA scope or Cloud Identity Service group).
- Support entity-level auditor scope override via `@Auditing.AuditorScopes: ['SCOPE_NAME']`.
- Support service-level default auditor scope via `@Auditing.DefaultAuditorScopes: ['SCOPE_NAME']`, with entity-level annotations taking precedence.
- Include auditor scope checks in both HANA analytic privileges and application-layer restrictions.

#### Dynamic Data Subject Roles

- Support dynamic data subject role assignment via `@PersonalData.DataSubjectRole` pointing to an enum property, allowing a single entity to represent multiple data subject roles (e.g., Customer, Employee, Debtor).
- Validate that dynamic role paths resolve to enum properties and do not traverse to-many associations.

#### Dynamic ILM Object Enablement

- Support `@ILM.BlockingEnabled` with static boolean values to enable or disable ILM Objects.
- Support `@ILM.BlockingEnabled` with CQL expression strings (e.g., `'(SELECT isEnabled FROM Configuration)'`) evaluated at runtime.

#### Conditions

- Support condition fields on ILM Objects annotated with `@PersonalData.FieldSemantics: 'PurposeID'` or `@ILM.FieldSemantics: 'ProcessOrganizationID'` to narrow retention policies to subsets of data.
- Expose conditions in the ILM object discovery response with descriptions, value help endpoints, and i18n keys.

#### Information Reporting (`sap.dpp.InformationService`)

- Provide the `sap.dpp.InformationService` as an OData V4 service at `/dpp/information`, requiring the `PersonalDataManagerUser` role, to integrate with the SAP DPI Information Reporting module.
- Automatically expose all entities annotated with `@PersonalData.EntitySemantics` and their compositions as read-only projections in the Information service.
- Automatically generate `@UI.LineItem` annotations for exposed entities, ordering fields by keys, semantic keys, personal data, sensitive data, and remaining fields.
- Automatically generate `@UI.FieldGroup` annotations for exposed entities if not already provided.

#### Extending Services

- Allow manual extension of the `sap.ilm.RetentionService` to expose entities with custom projections, aliases, or computed fields from associations (e.g., exposing a `DataControllerID` from a navigation path).
- Allow manual extension of the `sap.dpp.InformationService` for customized entity exposure.
- Detect already-exposed entities and skip automatic exposure for them.

#### Multi-Tenancy

- Register DPI service instances as SaaS dependencies via `cds.xt.SaasProvisioningService` or `cds.xt.SmsProvisioningService` for tenant subscription flows.

#### Miscellaneous

- `applicationName` configurable via `cds.env.requires['sap.ilm.RetentionService'].applicationName`. By default using the name from package.json.
- Leverage CAP's built-in audit logging for all queries performed by the Retention Manager against the database.
- `tableRestrictions` configurable via `cds.env.requires['sap.ilm.RetentionService'].tableRestrictions` with `"srv"` (default) or `"db"` options.
