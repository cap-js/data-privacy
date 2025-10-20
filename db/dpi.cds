using { managed, cuid } from '@sap/cds/common';

namespace sap.dpi;


entity ILMObjectV2 : cuid, managed {
  iLMObjectName    : String;
  iLMObjectVersion : Integer;
  configVersion    : Integer;
  configuration    : LargeString;
}

aspect dppFlags {
  dppBlockingDate : Date            @UI.HiddenFilter;
  dppEarliestDestructionDate : Date @UI.HiddenFilter;
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