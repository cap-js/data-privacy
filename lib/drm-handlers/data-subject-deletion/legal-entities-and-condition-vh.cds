using DRMService from '../../drm-service';

@readonly
entity legalEntities {
    key dataSubjectRole : String;
        value           : String;
        valueDesc       : String;
} 

@readonly
entity conditionFieldValues {
    key value: String;
      valueDesc: String;
}

extend service DRMService with {
    @readonly
    entity organizationAttributeValues {
        key dataSubjectRoleName : String;
            organizationAttributeValue           : String;
            organizationAttributeValueDescription       : String;
    }
}