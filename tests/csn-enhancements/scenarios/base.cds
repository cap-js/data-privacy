// Proxy for importing schema from bookshop sample
using {
  Country,
  Currency,
  managed,
  cuid,
  sap.common.CodeList
} from '@sap/cds/common';

namespace sap.ilm.bookshop;

entity Books : managed {
  key ID       : Integer;
      title    : localized String(111);
      descr    : localized String(1111);
      author   : Association to Authors;
      genre    : Association to Genres;
      stock    : Integer;
      price    : Decimal(9, 2);
      currency : Currency;
}

entity Authors : managed {
  key ID           : Integer;
      name         : String(111);
      dateOfBirth  : Date;
      dateOfDeath  : Date;
      placeOfBirth : String;
      placeOfDeath : String;
      books        : Association to many Books
                       on books.author = $self;
}

entity Genres : CodeList {
  key ID       : Integer;
      parent   : Association to Genres;
      children : Composition of many Genres
                   on children.parent = $self;
}

@Core.Description: 'ORDER_DOCUMENT_DESCR'
@Common.SemanticKey: [OrderNo]
entity Orders : cuid, managed {
  OrderNo           : String @title: 'Order Number'; //> readable key
  Items             : Composition of many OrderItems
                        on Items.parent_ID = ID;
  currency          : Currency @Common.ValueList: {
    CollectionPath: 'Currencies',
    Parameters: [
      {
        $Type: 'Common.ValueListParameterInOut',
        LocalDataProperty: currency_code,
        ValueListProperty: 'code',
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'name',
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'descr',
      },
    ]
  };
  Customer          : Association to Customers @title: 'CUSTOMER';
  endOfWarrantyDate : Date @title: 'End of warranty date';
  Payments          : Composition of many Payments
                        on Payments.Order = $self
                      @title: 'Payments';
  legalEntity       : Association to one LegalEntities @title: 'Legal entity';
}

entity OrderItems : cuid {
  parent_ID  : UUID;
  book       : Association to one Books;
  amount     : Integer;
  netAmount  : Decimal(9, 2);
  deliveries : Composition of many Deliveries
                 on deliveries.parent = $self;
}

entity Deliveries : cuid {
  parent  : Association to one OrderItems;
  dueDate : Date;
  comment : String;
}

@title: ''
@Core.Description: 'Payment Document'
entity Payments : cuid, managed {
  Order    : Association to Orders @title: 'Order';
  payDate  : Date @title: 'Pay date';
  amount   : Decimal(15, 2) @title: 'Amount';
  currency : Currency @title: 'Currency';
  customer : Association to one Customers;
}

@title: ''
@Core.Description: 'Marketing Document'
entity Marketing : cuid, managed {
  Customer      : Association to Customers @title: 'Customer';
  text          : String @title: 'Text';
  marketingDate : Date @title: 'Marketing date';
  legalEntity   : Association to one LegalEntities @title: 'Legal entity';
}

entity ILMObjectWithStaticBlockingDisabled : cuid {
  Customer           : Association to Customers @title: 'Customer';
  text               : String @title: 'Text';
  marketingDate      : Date @title: 'Marketing date';
  legalEntity        : Association to one LegalEntities @title: 'Legal entity';
  legacyBlockingDate : Date @PersonalData.FieldSemantics: 'BlockingDate';
}

entity ILMObjectWithEDMJSONBlockingEnabled : cuid {
  Customer              : Association to Customers @title: 'Customer';
  text                  : String @title: 'Text';
  marketingDate         : Date @title: 'Marketing date';
  legalEntity2          : Association to one LegalEntities @title: 'Legal entity';
  legacyDestructionDate : Date @PersonalData.FieldSemantics: 'EndOfRetentionDate';
}

entity ILMObjectWithXPRBlockingEnabled : cuid {
  employee              : Association to Employees @title: 'Employee';
  text                  : String @title: 'Text';
  marketingDate         : Date @title: 'Marketing date';
  legalEntity           : Association to one LegalEntities @title: 'Legal entity';
  legacyBlockingDate    : Date @PersonalData.FieldSemantics: 'BlockingDate';
  legacyDestructionDate : Date @PersonalData.FieldSemantics: 'EndOfRetentionDate';
}

@odata.singleton
entity Configuration {
  key ID                : Integer default 1;
      isBlockingEnabled : Boolean default true;
}

@Core.Description: 'Customer'
entity Customers : cuid, managed {
  email         : String @title: 'Email';
  firstName     : String @title: 'First name';
  lastName      : String @title: 'Last name';
  gender        : String @title: 'Gender';
  dateOfBirth   : Date @title: 'Date of birth';
  legalEntity   : Association to one LegalEntities @title: 'Legal entity';
  postalAddress : Composition of one CustomerPostalAddress
                    on postalAddress.Customer = $self
                  @title: 'Postal address';
  billingData   : Composition of one CustomerBillingData
                    on billingData.Customer = $self
                  @title: 'Billing data';
}

@Core.Description: 'Employee'
entity Employees : cuid, managed {
  email                 : String @title: 'Email';
  firstName             : String @title: 'First name';
  lastName              : String @title: 'Last name';
  validTo               : Date @title: 'Valid to';
  legalEntity           : Association to one LegalEntities @title: 'Legal entity';
  legacyBlockingDate    : Date @PersonalData.FieldSemantics: 'BlockingDate';
  legacyDestructionDate : Date @PersonalData.FieldSemantics: 'EndOfRetentionDate';
}


entity CustomerBillingData : cuid, managed {
  Customer     : Association to one Customers;
  creditCardNo : String @title: 'Credit card number';
}

entity CustomerPostalAddress : cuid, managed {
  Customer       : Association to one Customers;
  street         : String(128);
  endOfCustomer  : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate'; //To test that attributes on comp level are included
  town           : String(128);
  country        : Country;
  someOtherField : String(128);
};

//Vendors
entity Vendors : cuid, managed {
  name  : String;
  phone : String;
}

@UI.HeaderInfo: {
  TypeName: 'LegalEntity',
  TypeNamePlural: 'LegalEntities',
  Title: {Value: title, },
  Description: {Value: description}
}
entity LegalEntities : managed {
  key title       : String;
      description : String;
}


annotate Payments with {
  ID @title: 'ID';
}

annotate Orders with {
  ID @title: 'ID';

};

annotate Marketing with {
  ID @title: 'ID';
};


// annotations for Data Privacy
annotate Customers with @(
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

annotate Employees with @(PersonalData: {
  DataSubjectRole: 'Employee',
  EntitySemantics: 'DataSubject'
}) {
  ID @PersonalData.FieldSemantics: 'DataSubjectID';
  email @PersonalData.IsPotentiallyPersonal;
  firstName @PersonalData.IsPotentiallyPersonal;
  lastName @PersonalData.IsPotentiallyPersonal;
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
}

annotate CustomerBillingData with @PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'DataSubjectDetails'
} {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  creditCardNo @PersonalData.IsPotentiallySensitive;
}

annotate CustomerPostalAddress with @PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'DataSubjectDetails'
} {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  street @PersonalData.IsPotentiallyPersonal;
  town @PersonalData.IsPotentiallyPersonal;
  country @PersonalData.IsPotentiallyPersonal;
}

annotate Orders with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other'
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfWarrantyDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
}

annotate Marketing with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other'
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  marketingDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate ILMObjectWithStaticBlockingDisabled with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other',
  ILM.BlockingEnabled: false
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  marketingDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate ILMObjectWithEDMJSONBlockingEnabled with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other',
  ILM.BlockingEnabled: {$edmJson: {$Path: '/CatalogService.EntityContainer/Configuration/isBlockingEnabled'}}
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  marketingDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity2 @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate ILMObjectWithXPRBlockingEnabled with @(
  PersonalData.DataSubjectRole: 'Employee',
  PersonalData.EntitySemantics: 'Other',
  ILM.BlockingEnabled: '(SELECT isBlockingEnabled FROM sap.ilm.bookshop.Configuration)'
) {
  employee @PersonalData.FieldSemantics: 'DataSubjectID';
  marketingDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

// UI annotation for SAP DPI Retention
annotate Marketing with @(UI.SelectionFields: [legalEntity_title]);

// SAP DPI Retention annotations - Capabilities
annotate Orders with @(Capabilities: {FilterRestrictions: {
  Filterable: true,
  RequiredProperties: [createdAt],
  NonFilterableProperties: [Customer_ID],
  FilterExpressionRestrictions: [{
    Property: OrderNo,
    AllowedExpressions: 'SingleRange'
  }]
}});

annotate Marketing with @(Capabilities: {FilterRestrictions: {
  Filterable: true,
  RequiredProperties: [createdAt]
}});

// SAP DPI Retention Annotations Communications - needed for Data Subject Information
//                                - needed for SAP DPI Information selection screen as well
annotate Customers with @Communication.Contact: {
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

annotate Employees with @Communication.Contact: {
  n: {
    surname: lastName,
    given: firstName,

  },
  email: [{
    address: email,
    type: #preferred,
  }],
};


entity OrdersNoOrgAttributes : cuid, managed {
  orderNo           : String @title: 'Order Number';
  currency          : Currency @Common.ValueList: {
    CollectionPath: 'Currencies',
    Parameters: [
      {
        $Type: 'Common.ValueListParameterInOut',
        LocalDataProperty: currency_code,
        ValueListProperty: 'code',
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'name',
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'descr',
      },
    ]
  };
  Customer          : Association to Customers @title: 'CUSTOMER';
  endOfWarrantyDate : Date @title: 'End of warranty date';

}

annotate OrdersNoOrgAttributes with
@Common.Label: 'OrdersNoOrgAttributes'
@Core.Description: '{i18n>Description of OrdersNoOrgAttributes}'
@ILM.BlockingEnabled: true
@ILM.ArchivingEnabled: true
@Capabilities.FilterRestrictions.Filterable: true
@Capabilities.FilterRestrictions.FilterExpressionRestrictions: [{
  property: orderno,
  allowedexpressions: 'SingleRange'
}] {
  endOfWarrantyDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
}
