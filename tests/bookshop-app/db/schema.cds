// Proxy for importing schema from bookshop sample
using {
  Country,
  Currency,
  managed,
  cuid,
  sap.common.CodeList
} from '@sap/cds/common';
using from '@sap/cds-common-content';

namespace sap.capire.bookshop;

entity Books : managed {
  key ID       : Integer;
      title    : localized String(111);
      descr    : localized String(1111);
      author   : Association to Authors;
      genre    : Association to Genres;
      stock    : Integer;
      price    : Decimal(9, 2);
      currency : Currency;
      image    : LargeBinary @Core.MediaType: 'image/png';
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

@Core.Description: '{i18n>ORDER_DOCUMENT_DESCR}'
@Common.SemanticKey: [OrderNo]
entity Orders : cuid, managed {
  OrderNo             : String @title: 'Order Number'; //> readable key
  Items               : Composition of many OrderItems
                          on Items.parent_ID = ID;
  currency            : Currency @Common.ValueList: {
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
  Customer            : Association to Customers @title: '{i18n>CUSTOMER}';
  endOfWarrantyDate   : Date @title: 'End of warranty date';
  Payments            : Composition of many Payments
                          on Payments.Order = $self
                        @title: 'Payments';
  legalEntity         : Association to one LegalEntities @title: 'Legal entity';

  managedComp2one     : Composition of one ManagedComp2One;
  unmanagedComp2oneID : UUID;
  // REVISIT: Causes crash in DBS
  //unmanagedComp2one : Composition of one UnmanagedComp2One on unmanagedComp2one.ID = unmanagedComp2oneID;
  unmanagedComp2one2  : Composition of one UnmanagedComp2One2
                          on unmanagedComp2one2.order = $self;
}

entity ManagedComp2One : cuid {
  propertyWithDPPStuff : String;
}

entity UnmanagedComp2One : cuid {
  propertyWithDPPStuff : String;
}

entity UnmanagedComp2One2 : cuid {
  order                : Association to one Orders;
  propertyWithDPPStuff : String;
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
  division              : Association to one Divisions;
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

@UI.HeaderInfo: {
  TypeName: 'LegalEntity',
  TypeNamePlural: 'LegalEntities',
  Title: {Value: title, },
  Description: {Value: description}
}
entity LegalEntities : managed {
  key title       : String;
      description : String;
      divisions   : Composition of many Divisions
                      on divisions.legalEntity = $self;
}

@cds.autoexposed: false
entity Divisions : cuid {
  legalEntity : Association to one LegalEntities;
  title       : String;
  description : String;
  purpose_ID  : UUID;
}


@Core.Description: 'Custom ILM Name Document'
entity ILMObjectWithCustomName : cuid, managed {
  Customer      : Association to Customers @title: 'Customer';
  text          : String @title: 'Text';
  marketingDate : Date @title: 'Marketing date';
  legalEntity   : Association to one LegalEntities @title: 'Legal entity';
}

annotate Payments with {
  ID @title: 'ID';
// Customer @Common : {
//   ValueList : {
//       CollectionPath : 'Customers',
//       Parameters : [
//           {
//               $Type : 'Common.ValueListParameterInOut',
//               LocalDataProperty : Customer_ID,
//               ValueListProperty : 'ID',
//           },
//           {
//               $Type : 'Common.ValueListParameterDisplayOnly',
//               ValueListProperty : 'firstName',
//           },
//       ],
//   },
// }
}

annotate Orders with {
  ID @title: 'ID';

};

annotate Marketing with {
  ID @title: 'ID';
};
