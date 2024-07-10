using {SelectionCriteria} from '../transactional-data-discovery';
using DRMService from '../../drm-service';

extend service DRMService with {
    action endOfResidence (
        applicationName: String,
        iLMObjectName: String,
        selectionCriteria: array of SelectionCriteria,
        retentionStartDate: String, //String instead of DateTime because DRM sends data in wrong format
        referenceDateName: String, //Date which is used as a reference
        excludedConditionSets: array of {
            conditionSet: array of {
                conditionFieldName: String;
                conditionFieldValue: String;
            }
        },
        conditionSet: array of {
            conditionFieldName: String;
            conditionFieldValue: String;
        },
    ) returns {
        iLMObjectInstancesArchiveCount: Integer;
        iLMObjectInstances: array of {
            keys: array of {
                ![key]: String;
                value: String;
            };
            retentionStartDate: DateTime;
        };
        deltatoken: String; //null means that no more records are left
    };

    action archive (
        applicationName: String,
        iLMObjectName: String,
        iLMObjectArchiveResidenceRules: array of {
            iLMObjectInstances: array of {
                retentionStartDate: DateTime;
                retentionEndDate: DateTime;
                keys: array of {
                    ![key]: String;
                    value: String;
                };
            };
            residenceRuleId: UUID;
        },
        referenceDateName: String,
    ) returns {
        success: Integer;
        failure: Integer;
    };
}