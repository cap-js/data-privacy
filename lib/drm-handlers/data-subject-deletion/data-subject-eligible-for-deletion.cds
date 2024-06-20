using {Condition} from '../transactional-data-discovery';
using DRMService from '../../drm-service';

action endOfResidenceDS (
    legalGround: String, 
    dataSubjectRole: String, 
    startTime: String,
    legalEntitiesResidenceRules: many {
      legalEntity: String;
      residenceRules: many { //What are the residence rules?
        residenceDate: String; //String instead of DateTime because DRM sends data in wrong format
        conditionSet: many Condition;
      }
    }
) returns {
    success: many {dataSubjectID: String };
    nonConfirmCondition: many {dataSubjectID: String };
};

action endOfResidenceDSConfirmation (
    legalGround: String, 
    dataSubjectRole: String, 
    startTime: String,
    dataSubjects: many {
      dataSubjectID: String
    },
    legalEntitiesResidenceRules: many {
      legalEntity: String;
      residenceRules: many { //What are the residence rules?
        residenceDate: String; //String instead of DateTime because DRM sends data in wrong format
        conditionSet: many Condition;
      }
    }
) returns many {dataSubjectID: String};

action dataSubjectInformation (
    applicationGroupName: String,
    dataSubjectRole: String,
    dataSubjectIds : many String
) returns many {
    dataSubjectId: String; 
    emailId: String; 
    name: String 
};


extend service DRMService with {
    action endOfResidenceDS (
        legalGround: String, 
        dataSubjectRole: String, 
        startTime: String,
        legalEntitiesResidenceRules: many {
        legalEntity: String;
        residenceRules: many { //What are the residence rules?
            residenceDate: String; //String instead of DateTime because DRM sends data in wrong format
            conditionSet: many Condition;
        }
        }
    ) returns {
        success: many {dataSubjectID: String };
        nonConfirmCondition: many {dataSubjectID: String };
    };

    action endOfResidenceDSConfirmation (
        legalGround: String, 
        dataSubjectRole: String, 
        startTime: String,
        dataSubjects: many {
        dataSubjectID: String
        },
        legalEntitiesResidenceRules: many {
        legalEntity: String;
        residenceRules: many { //What are the residence rules?
            residenceDate: String; //String instead of DateTime because DRM sends data in wrong format
            conditionSet: many Condition;
        }
        }
    ) returns many {dataSubjectID: String};

    action dataSubjectInformation (
        applicationGroupName: String,
        dataSubjectRole: String,
        dataSubjectIds : many String
    ) returns many {
        dataSubjectId: String; 
        emailId: String; 
        name: String 
    };
}