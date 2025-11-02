namespace sap.dpi;

aspect dppFlags {
  dppBlockingDate : Date            @UI.HiddenFilter @PersonalData.FieldSemantics : 'BlockingDate';
  dppEarliestDestructionDate : Date @UI.HiddenFilter @PersonalData.FieldSemantics : 'EndOfRetentionDate';
}

type Condition : {
    conditionFieldName: String;
    conditionFieldValue: String;
}

type SelectionCriteria {
    name: String;
    value: String; //null is allowed
    valueRange: { //null is allowed
      ![from]: String; //TODO- ensure that it is correclty converted at all places where selection criteria are used - especially numbers
      to: String;
    };
}