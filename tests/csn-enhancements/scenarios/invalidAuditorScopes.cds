using {cuid} from '@sap/cds/common';

// Invalid: contains special characters (SQL injection attempt)
@Auditing.AuditorScopes: [
  'Valid_Role',
  'Invalid%Role'
]
@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other'
}
entity InvalidAuditorScope1 : cuid {
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
}

// Invalid: contains spaces
@Auditing.AuditorScopes: ['Role With Spaces']
@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other'
}
entity InvalidAuditorScope2 : cuid {
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
}

// Valid: ASCII word characters only
@Auditing.AuditorScopes: [
  'CUSTOMER_AUDITOR',
  'Admin123'
]
@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other'
}
entity ValidAuditorScope : cuid {
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
}
