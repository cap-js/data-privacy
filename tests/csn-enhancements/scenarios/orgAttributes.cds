using sap.ilm.bookshop as bookshop from './base';

extend bookshop.Orders with {
  secondLegalEntity : String @PersonalData.FieldSemantics: 'DataControllerID';
}
