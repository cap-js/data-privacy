using {Condition} from '../transactional-data-discovery';
using DRMService from '../../drm-service';

action dataSubjectLegalEntities (
     legalGround: String, 
     dataSubjectRole: String, 
     dataSubjectID: String
) returns many {legalEntity: String};

action retentionStartDate (
    dataSubjectRole: String, 
    legalEntity: String, 
    startTime: String, 
    dataSubjectID: String, 
    legalGround: String,
    rulesConditionSet: many {
      retentionID: String; //Question: What is the retention ID?
      conditionSet: many Condition;
    }
) returns array of {
    retentionID: String;
    retentionStartDate: String;
};

action dataSubjectEndOfBusiness (
    legalGround: String, 
    dataSubjectRole: String, 
    dataSubjectID: String
) returns {
    dataSubjectExpired: Boolean;
    dataSubjectNotExpiredReason: String;
};

action deleteDataSubject (
    applicationGroupName: String, 
    dataSubjectRole: String, 
    dataSubjectID: String, 
    maxDeletionDate: String //String instead of DateTime because DRM sends data in wrong format
);
  
action destroyDataSubjects(
    applicationGroupName: String, 
    dataSubjectRole: String
);

/**
   * This endpoint has to be implemented by the application to delete (block) the transactional data instances for a given data subject and data subject role.
      It would be invoked when data subject deletion is triggered from DRM.
      When this call is triggered the application has to block the transactional data instances until the maxDeletionDate passed in the payload has been crossed and also persist the maxDeletionDate for each of the transactional data instances.
      If the maxDeletionDate has been crossed for the transactional data instances then a hard delete can be performed on these records.
      Note -

      This endpoint has to be provided in the service instance configuration under-
    retention-configs => dataSubjects => legalGrounds => dataSubjectLegalGroundDeletionEndPoint
*/
action deleteLegalGroundInstances (
    dataSubjectID: String, 
    dataSubjectRole: String, 
    startTime: String, 
    maxDeletionDate: String, //String instead of DateTime because DRM sends data in wrong format
    legalGround: String,
    retentionRules: array of RetentionRule
);

type RetentionRule : {
    legalEntity: String;
    retentionPeriod: Integer;
    retentionUnit: String;
    conditionSet: array of Condition
}

action destroyLegalGroundInstances (
    legalGround: String,
    dataSubjectRole: String
);


extend service DRMService with {
    action dataSubjectLegalEntities (
        legalGround: String, 
        dataSubjectRole: String, 
        dataSubjectID: String
    ) returns many {legalEntity: String};

    action retentionStartDate (
        dataSubjectRole: String, 
        legalEntity: String, 
        startTime: String, 
        dataSubjectID: String, 
        legalGround: String,
        rulesConditionSet: many {
        retentionID: String; //Question: What is the retention ID?
        conditionSet: many Condition;
        }
    ) returns array of {
        retentionID: String;
        retentionStartDate: String;
    };

    action dataSubjectEndOfBusiness (
        legalGround: String, 
        dataSubjectRole: String, 
        dataSubjectID: String
    ) returns {
        dataSubjectExpired: Boolean;
        dataSubjectNotExpiredReason: String;
    };

    action deleteDataSubject (
        applicationGroupName: String, 
        dataSubjectRole: String, 
        dataSubjectID: String, 
        maxDeletionDate: String //String instead of DateTime because DRM sends data in wrong format
    );
    
    action destroyDataSubjects(
        applicationGroupName: String, 
        dataSubjectRole: String
    );

    /**
     * This endpoint has to be implemented by the application to delete (block) the transactional data instances for a given data subject and data subject role.
         It would be invoked when data subject deletion is triggered from DRM.
        When this call is triggered the application has to block the transactional data instances until the maxDeletionDate passed in the payload has been crossed and also persist the maxDeletionDate for each of the transactional data instances.
        If the maxDeletionDate has been crossed for the transactional data instances then a hard delete can be performed on these records.
        Note -

        This endpoint has to be provided in the service instance configuration under-
        retention-configs => dataSubjects => legalGrounds => dataSubjectLegalGroundDeletionEndPoint
    */
    action deleteLegalGroundInstances (
        dataSubjectID: String, 
        dataSubjectRole: String, 
        startTime: String, 
        maxDeletionDate: String, //String instead of DateTime because DRM sends data in wrong format
        legalGround: String,
        retentionRules: array of RetentionRule
    );

    type RetentionRule : {
        legalEntity: String;
        retentionPeriod: Integer;
        retentionUnit: String;
        conditionSet: array of Condition
    }

    action destroyLegalGroundInstances (
        legalGround: String,
        dataSubjectRole: String
    );
}