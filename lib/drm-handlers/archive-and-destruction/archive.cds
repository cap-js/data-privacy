using {SelectionCriteria} from '../transactional-data-discovery';
using DRMService from '../../drm-service';

/**
   * Application has to implement this endpoint to fetch the list of transactional data instances that have completed the end of business.
    Data retention manager calls this endpoint when archiving of the transactional data is triggered.
    Application checks if the business was completed for the given transactional data instances on or before the retentionStartDate, 
    which is passed in the payload. API should return the keys that are used to identify transactional data instances whose end of business is reached.

    Note - this endpoint should be provided in the service instance configuration under 
      retention-configs => dataSubjects => legalGrounds => legalGroundArchiveEndOfResidenceEndPoint
    keys should be provided in the service instance configurantion under retention-configs => dataSubjects => legalGrounds => legalGroundKeyColumns
*/
action endOfResidence (
    legalGround: String,
    selectionCriteria: array of SelectionCriteria,
    excludedLegalEntities: array of String,
    retentionStartDate: String, //String instead of DateTime because DRM sends data in wrong format
    startTime: String, //What is that?
    conditionSet: array of {
      businessPurposeName: String; //What is the business purpose?
      legalGroundName: String;
      ruleIdentifier: Integer;
      ruleIdentifierGuid: UUID; //What is that value
      conditionFieldName: String;
      conditionFieldValue: String;
    },
    dataSubjectRole: String, //Example value: ALL
    residenceRuleId: String, //What is that value
    legalEntity: String, //Example value: ALL
) returns {
    residenceRuleId: String;
    legalGroundInstancesArchiveCount: Integer;
    legalGroundInstances: array of {
        keys: array of {
            ![key]: String;
            value: String;
        };
        retentionStartDate: DateTime;
    };
    deltatoken: String; //null means that no more records are left
};

/**
   * This endpoint needs to be implemented by the application to handle the archive requests that are triggered from DRM.
      For each transactional data instance that is passed in the payload, the application should persist the retentionEndDate. 
      Once the retention end date has been crossed then the application can either move the transactional data to a secondary persistence and 
      map each of the transactional data record to it's respective retentionEndDate or restrict the access to these records, 
      this is based on however the application wants to implement.
      Note -
      this endpoint should be provided in the service instance configuration under
      retention-configs => dataSubjects => legalGrounds=> legalGroundArchiveDeletionEndPoint
*/
action archive (
    legalGround: String,
    legalGroundArchiveResidenceRules: array of {
      legalGroundInstances: array of {
          retentionEndDate: DateTime;
          keys: array of {
            ![key]: String;
            value: String;
          };
          retentionStartDate: DateTime;
      };
      residenceRuleId: UUID;
    },
    startTime: String,
) returns {
    success: Integer;
    failure: Integer;
};


extend service DRMService with {
    action endOfResidence (
        legalGround: String,
        selectionCriteria: array of SelectionCriteria,
        excludedLegalEntities: array of String,
        retentionStartDate: String, //String instead of DateTime because DRM sends data in wrong format
        startTime: String, //What is that?
        conditionSet: array of {
        businessPurposeName: String; //What is the business purpose?
        legalGroundName: String;
        ruleIdentifier: Integer;
        ruleIdentifierGuid: UUID; //What is that value
        conditionFieldName: String;
        conditionFieldValue: String;
        },
        dataSubjectRole: String, //Example value: ALL
        residenceRuleId: String, //What is that value
        legalEntity: String, //Example value: ALL
    ) returns {
        residenceRuleId: String;
        legalGroundInstancesArchiveCount: Integer;
        legalGroundInstances: array of {
            keys: array of {
                ![key]: String;
                value: String;
            };
            retentionStartDate: DateTime;
        };
        deltatoken: String; //null means that no more records are left
    };

    action archive (
        legalGround: String,
        legalGroundArchiveResidenceRules: array of {
        legalGroundInstances: array of {
            retentionEndDate: DateTime;
            keys: array of {
                ![key]: String;
                value: String;
            };
            retentionStartDate: DateTime;
        };
        residenceRuleId: UUID;
        },
        startTime: String,
    ) returns {
        success: Integer;
        failure: Integer;
    };
}