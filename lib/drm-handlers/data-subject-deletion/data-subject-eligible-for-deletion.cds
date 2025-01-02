using {Condition} from '../data-discovery';
using DRMService from '../../drm-service';

extend service DRMService with {
    action dataSubjectsEndOfResidence (
        applicationName: String,
        iLMObjectName: String, 
        dataSubjectRoleName: String, 
        referenceDates: many {
            referenceDateName: String;
            organizationAttributeResidenceSet: many {
                organizationAttributeName: String;
                organizationAttributeValue: String;
                residenceSet: many { //What are the residence rules?
                    retentionStartDate: String; //String instead of DateTime because DRM sends data in wrong format
                    conditionSet: many Condition;
                }
            };
        }
    ) returns {
        success: many {dataSubjectId: String };
        nonConfirmCondition: many {dataSubjectId: String };
    };

    action dataSubjectsEndOfResidenceConfirmation (
        applicationName: String,
        iLMObjectName: String, 
        dataSubjectRoleName: String, 
        dataSubjects: many {
            dataSubjectId: String
        },
        referenceDates: many {
            referenceDateName: String;
            organizationAttributeResidenceSet: many {
                organizationAttributeName: String;
                organizationAttributeValue: String;
                residenceSet: many { //What are the residence rules?
                    retentionStartDate: String; //String instead of DateTime because DRM sends data in wrong format
                    conditionSet: many Condition;
                }
            };
        }
    ) returns many {dataSubjectId: String};

    action dataSubjectInformation (
        applicationName: String,
        dataSubjectRoleName: String,
        dataSubjects : many {
            dataSubjectId: String
        },
    ) returns many {
        dataSubjectId: String; 
        emailId: String; 
        name: String 
    };
}