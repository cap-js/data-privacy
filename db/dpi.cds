namespace sap.ilm;

aspect destruction {
  ilmEarliestDestructionDate : Date  @UI.HiddenFilter  @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  ilmLatestDestructionDate   : Date @UI.HiddenFilter;
}

aspect blocking {
  dppBlockingDate : Date  @UI.HiddenFilter  @PersonalData.FieldSemantics: 'BlockingDate';
}

type Condition : {
  conditionFieldName  : String;
  conditionFieldValue : String;
}

type SelectionCriteria {
  name       : String;
  value      : String; //null is allowed
  valueRange : { //null is allowed
    ![from] : String; //TODO- ensure that it is correclty converted at all places where selection criteria are used - especially numbers
    to      : String;
  };
}

type ReferenceDate {
  /**
   * The date field or property in the business application which is used as the
   * reference for denoting the start of retention to calculate the end of retention
   * date based on the rules
   */
  referenceDateName                 : String;
  /**
   * List of the organization attribute values configured for a reference date along
   * with the corresponding residence sets
   */
  organizationAttributeResidenceSet : many {
    /**
     * Name of the attribute or field or property which defines the organizational
     * structure of the business
     */
    organizationAttributeName  : String;
    /**
     * Value for the organization attribute configured as part of the business purpose
     */
    organizationAttributeValue : String;
    /**
     * List of the residence set information which contains the retention start date
     * provided by DPI NextGen Retention Management along with the condition sets
     */
    residenceSet               : many {
      /**
       * The latest start date of the retention or the end of business date calculated by
       * DPI NextGen Retention Management based on the configured rules for data subjects
       * to be eligible for blocking or deletion
       */
      retentionStartDate : String; //REVISIT: String instead of DateTime because SAP DPI Retention sends data in wrong format
      /**
       * List of condition field name and value that is configured as part of the
       * business purpose
       */
      conditionSet       : many Condition;
    }
  };
}
