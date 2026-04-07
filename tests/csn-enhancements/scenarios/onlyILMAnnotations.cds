using {
  sap,
  managed,
  cuid
} from '@sap/cds/common';

context sap.samples.poetryslams {

  entity Visits : cuid {
    dateTime            : DateTime @PersonalData: {FieldSemantics: 'EndOfBusinessDate', };
    PoetrySlamOrganizer : Association to one PoetrySlamOrganizers @ILM.FieldSemantics: 'LineOrganizationID';
    visitor             : Association to one Visitors;
  }

  entity PoetrySlamOrganizers {
    key title       : String;
        description : String;
  }

  entity Visitors : cuid {
    name   : String;
    email  : String;
    visits : Association to many Visits
               on visits.visitor = $self;
  }

}

annotate sap.samples.poetryslams.Visitors with @(
  PersonalData: {
    DataSubjectRole: 'Visitor',
    EntitySemantics: 'DataSubject'
  },
  Communication.Contact: {
    fn: name,
    email: [{
      type: #home,
      address: email
    }]
  }
) {
  ID @PersonalData.FieldSemantics: 'DataSubjectID';
}

annotate sap.samples.poetryslams.Visits with @PersonalData: {
  EntitySemantics: 'Other',
  DataSubjectRole: 'Visitor'
} {
  visitor @PersonalData.FieldSemantics: 'DataSubjectID';
}
