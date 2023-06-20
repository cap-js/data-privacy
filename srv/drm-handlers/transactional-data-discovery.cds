using DRMService from '../drm-service';
 
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

extend service DRMService with {
  @readonly
  entity legalGrounds {
    key ID: UUID //Just empty facet for handler to return legal grounds
  }
}

@readonly
entity legalGrounds {
    key ID: UUID //Just empty facet for handler to return legal grounds
}