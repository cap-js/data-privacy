using {
  Country,
  Currency,
  managed,
  cuid,
  sap.common.CodeList
} from '@sap/cds/common';

namespace sap.capire.bookshop;

entity Authors : managed {
  key ID   : Integer;
      name : String(111);
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

entity Payments : cuid, managed {
  Order    : Association to Orders;
  payDate  : Date;
  amount   : Decimal(15, 2);
  currency : Currency;
}

entity Customers : cuid, managed {
  email         : String;
  firstName     : String;
  lastName      : String;
  gender        : String;
  dateOfBirth   : Date;
  legalEntity   : Association to one LegalEntities;
  postalAddress : Composition of one CustomerPostalAddress
                    on postalAddress.Customer = $self;
  billingData   : Composition of one CustomerBillingData
                    on billingData.Customer = $self;
}

entity CustomerBillingData : cuid, managed {
  Customer     : Association to one Customers;
  creditCardNo : String;
}

entity CustomerPostalAddress : cuid, managed {
  Customer       : Association to one Customers;
  street         : String(128);
  endOfCustomer  : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  town           : String(128);
  country        : Country;
  someOtherField : String(128);
}

entity LegalEntities : managed {
  key title       : String;
      description : String;
}
