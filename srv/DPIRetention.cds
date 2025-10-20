@requires: 'DataRetentionManagerUser'
@protocol: 'rest'
@cds.provided
service DPIRetentionService @(path: '/drm') {

    entity ![i18n-files] {
        key file: String;
    }

    @readonly
    entity iLMObjects {
        key ID: UUID //Just empty facet for handler to return iLMObjects
    }
};