using {
  sap,
  managed,
  cuid
} from '@sap/cds/common';

context sap.samples.poetryslams {


  entity PoetrySlams : cuid {
    title               : String(255);
    dateTime            : DateTime;
    visits              : Composition of many Visits
                            on visits.parent = $self;
    PoetrySlamOrganizer : Association to one PoetrySlamOrganizers;
  }

  entity Visits : cuid {
    parent  : Association to one PoetrySlams;
    visitor : Association to one Visitors;
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

};

using {sap.ilm.RetentionService} from '../../../srv/DPIRetention';

extend service RetentionService with {
  entity Visits as
    projection on sap.samples.poetryslams.Visits {
      *,
      parent.PoetrySlamOrganizer @(PersonalData.FieldSemantics: 'DataControllerID'),
      parent.dateTime @(PersonalData.FieldSemantics: 'EndOfBusinessDate')
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
