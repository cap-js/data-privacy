using sap.ilm.bookshop as bookshop from './base';

annotate bookshop.Orders with {
  legalEntity  @PersonalData.FieldSemantics #LegalEntity: 'DataControllerID'  @PersonalData.FieldSemantics #Condition: 'PurposeID';
};

annotate bookshop.Marketing with {
  legalEntity  @PersonalData.FieldSemantics: 'DataControllerID'  @ILM.FieldSemantics: 'ProcessOrganizationID';
}

annotate bookshop.ILMObjectWithEDMJSONBlockingEnabled with {
  legalEntity2  @PersonalData.FieldSemantics: 'PurposeID'  @ILM.FieldSemantics: 'LineOrganizationID';
}
