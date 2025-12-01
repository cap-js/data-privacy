using {sap.dpp.dppFlags} from '../db/dpi';

@requires: 'DataRetentionManagerUser'
@protocol: 'rest'
service sap.dpp.RetentionService @(path: '/dpp/retention') {

    @cds.persistence.exists
    @cds.persistence.skip
    entity ![i18n-files] {
        key file: String;
    }

    @readonly
    @cds.persistence.exists
    @cds.persistence.skip
    entity iLMObjects : dppFlags {
        //dppFlags just being used to have in m.definitions
        key iLMObjectName: String;
        isILMObjectEnabled: Boolean;
    }
};