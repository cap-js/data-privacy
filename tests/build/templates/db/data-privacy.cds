using {sap.capire.bookshop} from './schema';

annotate bookshop.Customers with @(PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'DataSubject'
}) {
  ID @PersonalData.FieldSemantics: 'DataSubjectID';
  email @PersonalData.IsPotentiallyPersonal;
  firstName @PersonalData.IsPotentiallyPersonal;
  lastName @PersonalData.IsPotentiallyPersonal;
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

annotate bookshop.Customers with @Communication.Contact: {
  n: {
    surname: lastName,
    given: firstName
  },
  bday: dateOfBirth,
  email: [{
    address: email,
    type: #preferred
  }],
  gender: gender
};
