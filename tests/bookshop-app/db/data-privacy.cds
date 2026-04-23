// Proxy for importing schema from bookshop sample
using {sap.capire.bookshop, } from './schema';

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

annotate bookshop.Employees with @(PersonalData: {
  DataSubjectRole: 'Employee',
  EntitySemantics: 'DataSubject'
}) {
  ID @PersonalData.FieldSemantics: 'DataSubjectID';
  email @PersonalData.IsPotentiallyPersonal;
  firstName @PersonalData.IsPotentiallyPersonal;
  lastName @PersonalData.IsPotentiallyPersonal;
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

annotate bookshop.ManagedComp2One with @(title: 'Composition to one test entity') {
  propertyWithDPPStuff @PersonalData: {IsPotentiallyPersonal, }
}

annotate bookshop.UnmanagedComp2One with @(title: 'Unmanaged Composition to one test entity') {
  propertyWithDPPStuff @PersonalData: {IsPotentiallyPersonal, }
}

annotate bookshop.UnmanagedComp2One2 with @(title: '2. Unmanaged Composition to one test entity') {
  propertyWithDPPStuff @PersonalData: {IsPotentiallyPersonal, }
}

annotate bookshop.Marketing with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other'
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  marketingDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate bookshop.Marketing.Campaigns with {
  name @PersonalData.IsPotentiallyPersonal;
};

annotate bookshop.UserNewsletters with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other'
) {
  Customer_ID @PersonalData.FieldSemantics: 'DataSubjectID';
  sentDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate bookshop.Newsletters.Attachments with {
  fileName @PersonalData.IsPotentiallyPersonal;
};

annotate bookshop.ILMObjectWithStaticBlockingDisabled with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other',
  ILM.BlockingEnabled: false
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  marketingDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate bookshop.ILMObjectWithEDMJSONBlockingEnabled with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other',
  ILM.BlockingEnabled: {$edmJson: {$Path: '/CatalogService.EntityContainer/Configuration/isBlockingEnabled'}}
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  marketingDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity2 @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate bookshop.ILMObjectWithXPRBlockingEnabled with @(
  PersonalData.DataSubjectRole: 'Employee',
  PersonalData.EntitySemantics: 'Other',
  ILM.BlockingEnabled: '(SELECT isBlockingEnabled FROM sap.capire.bookshop.Configuration)'
) {
  employee @PersonalData.FieldSemantics: 'DataSubjectID';
  marketingDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
};

annotate bookshop.ILMObjectWithCustomName with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other',
  ILM.ObjectName: 'CustomILMName'
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  marketingDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

// UI annotation for SAP DPI Retention
annotate bookshop.Marketing with @(UI.SelectionFields: [legalEntity_title]);

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

annotate bookshop.Marketing with @(Capabilities: {FilterRestrictions: {
  Filterable: true,
  RequiredProperties: [createdAt]
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

annotate bookshop.Employees with @Communication.Contact: {
  n: {
    surname: lastName,
    given: firstName,

  },
  email: [{
    address: email,
    type: #preferred,
  }],
};
