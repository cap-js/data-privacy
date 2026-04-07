using {
  Currency,
  managed,
  cuid
} from '@sap/cds/common';

namespace sap.capire.bookshop;

entity Books : managed {
  key ID       : Integer;
      title    : localized String(111);
      descr    : localized String(1111);
      stock    : Integer;
      price    : Decimal(9, 2);
      currency : Currency;
      image    : LargeBinary @Core.MediaType: 'image/png';
}

entity Orders : cuid, managed {
  OrderNo           : String @title: 'Order Number'; //> readable key
  Items             : Composition of many OrderItems
                        on Items.parent_ID = ID;
  currency          : Currency;
  Customer          : Association to Customers @title: '{i18n>CUSTOMER}';
  endOfWarrantyDate : Date @title: 'End of warranty date';
  legalEntity       : Association to one LegalEntities @title: 'Legal entity';
  associatedEntity  : Association to one Foo;
}

entity Foo : cuid {};

entity OrderItems : cuid {
  parent_ID : UUID;
  book      : Association to Books;
  amount    : Integer;
  netAmount : Decimal(9, 2);
}

@Core.Description: 'Customer'
entity Customers : cuid, managed {
  email         : String @title: 'Email';
  firstName     : String @title: 'First name';
  lastName      : String @title: 'Last name';
  gender        : String @title: 'Gender';
  dateOfBirth   : Date @title: 'Date of birth';
  endOfCustomer : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity   : Association to one LegalEntities @title: 'Legal entity';
}

entity LegalEntities : managed {
  key title       : String;
      description : String;
}

annotate Customers with @(PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'DataSubject',
  Communication.Contact: {
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
  }
}) {
  ID @PersonalData.FieldSemantics: 'DataSubjectID';
  email @PersonalData.IsPotentiallyPersonal;
  firstName @PersonalData.IsPotentiallyPersonal;
  lastName @PersonalData.IsPotentiallyPersonal;
  //  creditCardNo @PersonalData.IsPotentiallySensitive;
  dateOfBirth @PersonalData.IsPotentiallyPersonal;
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
}

annotate Orders with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other'
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfWarrantyDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
}
