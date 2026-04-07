using {sap.samples.poetryslams as poetrySlamManagerModel} from './poetrySlamManagerModel';

using {sap.ilm.RetentionService} from '@sap/cds-dpi';

extend service RetentionService with {

  entity Visits              as
    projection on poetrySlamManagerModel.Visits {
      *,
      parent.PoetrySlamOrganizer @(PersonalData.FieldSemantics: 'DataControllerID'),
      parent.dateTime @(PersonalData.FieldSemantics: 'EndOfBusinessDate')
    };

  entity PoetrySlamOrganizer as projection on poetrySlamManagerModel.PoetrySlamOrganizers;
}

annotate poetrySlamManagerModel.Visitors with @(
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

// annotate poetrySlamManagerModel.VisitorsDataControllerMapping with @PersonalData: {
//     DataSubjectRole: 'Visitor',
//     EntitySemantics: 'DataSubjectDetails'
// } {
//     ID             @PersonalData.FieldSemantics                                 : 'DataSubjectID';
//     dataController @PersonalData.FieldSemantics                                 : 'DataControllerID';
// }

annotate poetrySlamManagerModel.Visits with @PersonalData: {
  EntitySemantics: 'Other',
  DataSubjectRole: 'Visitor'
} {
  visitor @PersonalData.FieldSemantics: 'DataSubjectID';
// dataController @PersonalData.FieldSemantics               : 'DataControllerID';
// mofifiedAt     @PersonalData.FieldSemantics               : 'EndOfBusinessDate';
}
