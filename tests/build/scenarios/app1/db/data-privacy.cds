// Proxy for importing schema from bookshop sample
using {sap.capire.bookshop} from './schema';

// annotations for Data Privacy
annotate bookshop.Customers with @(
  PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'DataSubject'
  },
  Auditing.AuditorScopes: ['CUSTOMER_AUDITOR']
) {
  ID @PersonalData.FieldSemantics: 'DataSubjectID';
  email @PersonalData.IsPotentiallyPersonal;
  firstName @PersonalData.IsPotentiallyPersonal;
  lastName @PersonalData.IsPotentiallyPersonal;
  //  creditCardNo @PersonalData.IsPotentiallySensitive;
  dateOfBirth @PersonalData.IsPotentiallyPersonal;
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
}

annotate bookshop.CustomerBillingData with @PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'DataSubjectDetails'
} {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  creditCardNo @PersonalData.IsPotentiallySensitive;
}

annotate bookshop.CustomerPostalAddress with @PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'DataSubjectDetails'
} {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  street @PersonalData.IsPotentiallyPersonal;
  town @PersonalData.IsPotentiallyPersonal;
  country @PersonalData.IsPotentiallyPersonal;
}

annotate bookshop.Orders with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other'
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfWarrantyDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
}

// SAP DPI Retention annotations - Capabilities
annotate bookshop.Orders with @(Capabilities: {FilterRestrictions: {
  Filterable: true,
  RequiredProperties: [createdAt],
  NonFilterableProperties: [Customer_ID],
  FilterExpressionRestrictions: [{
    Property: OrderNo,
    AllowedExpressions: 'SingleRange'
  }]
}});

// SAP DPI Retention Annotations Communications - needed for Data Subject Information
//                                - needed for SAP DPI Information selection screen as well
annotate bookshop.Customers with @Communication.Contact: {
  n: {
    surname: lastName,
    given: firstName,

  },
  bday: dateOfBirth,
  email: [{
    address: email,
    type: #preferred,
  }],
  gender: gender
};
