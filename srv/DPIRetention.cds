using {
  sap.ilm.blocking,
  sap.ilm.destruction
} from '../db/dpi';

@requires: 'DataRetentionManagerUser'
@protocol: 'rest'
service sap.ilm.RetentionService @(path: '/dpp/retention') {

  @cds.persistence.exists
  @cds.persistence.skip
  entity ![i18n-files] {
    key file : String;
  }

  @readonly
  @cds.persistence.exists
  @cds.persistence.skip
  entity iLMObjects : blocking, destruction {
        //blocking, destruction just being used to have in m.definitions
    key iLMObjectName      : String;
        isILMObjectEnabled : Boolean;
  }
};
