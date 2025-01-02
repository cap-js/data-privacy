using {Condition} from '../data-discovery';
using DRMService from '../../drm-service';

extend service DRMService with {
    action dataSubjectEndOfBusiness (
        applicationName: String,
        iLMObjectName: String, 
        dataSubjectRoleName: String, 
        dataSubjectId: String
    ) returns {
        dataSubjectExpired: Boolean;
        dataSubjectNotExpiredReason: String;
    };

    action dataSubjectOrganizationAttributeValues (
        applicationName: String,
        iLMObjectName: String, 
        dataSubjectRoleName: String, 
        dataSubjectId: String,
        organizationAttributeName: String,
    ) returns many {organizationAttributeValue: String};

    action dataSubjectLatestRetentionStartDates (
        applicationName: String,
        dataSubjectRoleName: String, 
        dataSubjectId: String, 
        organizationAttributeName: String, 
        organizationAttributeValue: String,
        referenceDateName: String, 
        iLMObjectName: String,
        retentionSet: many {
            retentionSetId: String; //Question: What is the retention ID?
            conditionSet: many Condition;
        }
    ) returns array of {
        retentionSetId: String;
        retentionStartDate: String;
    };

    action dataSubjectBlocking (
        applicationName: String, 
        dataSubjectRoleName: String, 
        dataSubjectId: String, 
        maxDeletionDate: String //String instead of DateTime because DRM sends data in wrong format
    );
    
    action dataSubjectsDestroying(
        applicationName: String, 
        dataSubjectRoleName: String
    ) returns String;

    /**
     * This endpoint has to be implemented by the application to delete (block) the transactional data instances for a given data subject and data subject role.
         It would be invoked when data subject deletion is triggered from DRM.
        When this call is triggered the application has to block the transactional data instances until the maxDeletionDate passed in the payload has been crossed and also persist the maxDeletionDate for each of the transactional data instances.
        If the maxDeletionDate has been crossed for the transactional data instances then a hard delete can be performed on these records.
        Note -

        This endpoint has to be provided in the service instance configuration under-
        retention-configs => dataSubjects => iLMObjects => dataSubjectILMObjectDeletionEndPoint
    */
    action dataSubjectILMObjectInstanceBlocking (
        applicationName: String,
        dataSubjectRoleName: String, 
        iLMObjectName: String,
        dataSubjectId: String, 
        maxDeletionDate: String, //String instead of DateTime because DRM sends data in wrong format
    ) returns Integer;

    action dataSubjectsILMObjectInstancesDestroying (
        applicationName: String,
        dataSubjectRoleName: String,
        iLMObjectName: String
    );
}