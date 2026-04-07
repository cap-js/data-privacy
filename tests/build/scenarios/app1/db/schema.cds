// Proxy for importing schema from bookshop sample
using {
  Country,
  Currency,
  managed,
  cuid,
  sap.common.CodeList
} from '@sap/cds/common';

namespace sap.capire.bookshop;

entity Authors : managed {
  key ID           : Integer;
      name         : String(111);
      dateOfBirth  : Date;
      dateOfDeath  : Date;
      placeOfBirth : String;
      placeOfDeath : String;
}

entity Genres : CodeList {
  key ID       : Integer;
      parent   : Association to Genres;
      children : Composition of many Genres
                   on children.parent = $self;
}

entity Orders : cuid, managed {
  OrderNo           : String;
  Items             : Composition of many OrderItems
                        on Items.parent_ID = ID;
  Customer          : Association to Customers;
  endOfWarrantyDate : Date;
  Payments          : Composition of many Payments
                        on Payments.Order = $self;
  legalEntity       : Association to one LegalEntities;
}

entity OrderItems : cuid {
  parent_ID  : UUID;
  book       : Integer;
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
}


annotate Payments with {
  ID @title: 'ID';
}

annotate Orders with {
  ID @title: 'ID';

};
