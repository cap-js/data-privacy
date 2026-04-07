using {sap.ilm.bookshop.Customers} from './base';
using {sap.ilm.bookshop.Orders} from './base';
using {sap.ilm.bookshop.CustomerPostalAddress} from './base';
using {sap.ilm.bookshop.Vendors} from './base';


extend Customers with elements {
  newEmail   : String @Communication.IsEmailAddress;
  newEmail2  : String @Communication.IsEmailAddress;
  phone      : String @Communication.IsPhoneNumber;
  phone1     : String @Communication.IsPhoneNumber;
  nickname   : String;
  middleName : String;
  namePrefix : String;
  nameSuffix : String;
  title      : String;
  photo      : String;

};

annotate Customers with
@(PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'DataSubject'
})
@ODM: {
  entityName: 'Customer',
  oid: 'ID'
} {
  phone @PersonalData.IsPotentiallyPersonal;
  phone1 @PersonalData.IsPotentiallyPersonal;
  nickname @PersonalData.IsPotentiallyPersonal;
  middleName @PersonalData.IsPotentiallyPersonal;
  namePrefix @PersonalData.IsPotentiallyPersonal;
  nameSuffix @PersonalData.IsPotentiallyPersonal;
  title @PersonalData.IsPotentiallyPersonal;
  dateOfBirth @PersonalData.IsPotentiallySensitive;
  gender @PersonalData.IsPotentiallySensitive;
  photo @PersonalData.IsPotentiallySensitive;
  postalAddress @PersonalData.IsPotentiallyPersonal;
  email @PersonalData.IsPotentiallyPersonal;


};

annotate Customers with @Communication.Contact: {
  n: {
    surname: lastName,
    given: firstName,
    middle: middleName,
    prefix: namePrefix,
    suffix: nameSuffix,
    nickname: nickname,
    title: title
  },
  email: [{address: email}],
  gender: gender,
  dateOfBirth: dateOfBirth,
  photo: photo,
  adress: {
    street: postalAddress.street,
    city: postalAddress.town,
    country: postalAddress.country
  }


};

annotate Orders with
@Common.Label: 'Orders'
@Core.Description: '{i18n>Description of Orders}'


@ILM.BlockingEnabled: true
@ILM.ArchivingEnabled: true
@Capabilities.FilterRestrictions.Filterable: true
@Capabilities.FilterRestrictions.FilterExpressionRestrictions: [{
  property: orderno,
  allowedexpressions: 'SingleRange'
}] {
  endOfWarrantyDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID'
  @Common.ValueList: {
    CollectionPath: 'LegalEntities',
    Parameters: [
      {
        $Type: 'Common.ValueListParameterInOut',
        LocalDataProperty: 'legalEntity_title',
        ValueListProperty: 'title'
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'description'
      }
    ]
  }
}

annotate CustomerPostalAddress {
  street
  @PersonalData.IsPotentiallyPersonal;
  town
  @PersonalData.IsPotentiallyPersonal;
  country
  @PersonalData.IsPotentiallyPersonal;

};


annotate Vendors {
  phone @PersonalData.IsPotentiallyPersonal;
}
