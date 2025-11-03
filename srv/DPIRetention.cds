using {sap.dpi.dppFlags} from '../db/dpi';

@requires: 'DataRetentionManagerUser'
@protocol: 'rest'
@cds.provided
service DPIRetentionService @(path: '/drm') {

    entity ![i18n-files] {
        key file: String;
    }

    @readonly
    entity iLMObjects : dppFlags {
        //dppFlags just being used to have in m.definitions
        key iLMObjectName: String;
    }
};