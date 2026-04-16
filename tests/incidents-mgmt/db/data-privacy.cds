using {sap.capire.incidents} from './schema';

annotate incidents.Customers with @(PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'DataSubject'
}) {
  ID @PersonalData.FieldSemantics: 'DataSubjectID';
  firstName @PersonalData.IsPotentiallyPersonal;
  lastName @PersonalData.IsPotentiallyPersonal;
  email @PersonalData.IsPotentiallyPersonal;
  phone @PersonalData.IsPotentiallyPersonal;
};

annotate incidents.Incidents with @(
  ILM.BlockingEnabled: true,
  Common.Label: 'Incidents',
  Core.Description: 'Description of Incidents',
  Capabilities.FilterRestrictions.NonFilterableProperties: ['modifiedBy'],
  PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'Other'
  }
) {
  title @PersonalData.IsPotentiallyPersonal;
  urgency @Common.Label: 'Custom Property Name' @Core.Description: 'Detailed description of urgency';
  conversations @Common.Label: 'Conversations' @Core.Description: 'Detailed description of Conversations';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID' @Common.ValueList: {
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
  };
  incidentResolvedDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  customer @PersonalData.FieldSemantics: 'DataSubjectID';

};

annotate incidents.Customers with @Communication.Contact: {
  n: {
    surname: lastName,
    given: firstName,

  },
  email: [{address: email}],
};
