using {
  Country,
  Currency,
  managed,
  cuid,
} from '@sap/cds/common';

namespace test.inlineComp;

entity LegalEntities : managed {
  key title       : String;
      description : String;
}

@Core.Description: 'Customer'
entity Customers : cuid, managed {
  email       : String @title: 'Email';
  firstName   : String @title: 'First name';
  lastName    : String @title: 'Last name';
  legalEntity : Association to one LegalEntities @title: 'Legal entity';
}

entity Newsletters : cuid, managed {
  subject     : String @title: 'Subject';
  sentDate    : Date @title: 'Sent date';
  legalEntity : Association to one LegalEntities @title: 'Legal entity';
  Attachments : Composition of many {
    key ID       : UUID;
        fileName : String @title: 'File name';
        mimeType : String @title: 'MIME type';
  };
}

// Projection — only this entity has DPI annotations
entity UserNewsletters as projection on Newsletters
                          where
                            subject != 'INTERNAL';


annotate Customers with @(
  PersonalData.DataSubjectRole : 'Customer',
  PersonalData.EntitySemantics : 'DataSubject'
) {
  ID          @PersonalData.FieldSemantics : 'DataSubjectID';
  email       @PersonalData.IsPotentiallyPersonal;
  firstName   @PersonalData.IsPotentiallyPersonal;
  lastName    @PersonalData.IsPotentiallyPersonal;
  legalEntity @PersonalData.FieldSemantics : 'DataControllerID';
};

annotate Customers with @Communication.Contact : {
  n     : { surname : lastName, given : firstName },
  email : [{ address : email, type : #preferred }]
};

// Only the projection gets DPI annotations
annotate UserNewsletters with @(
  PersonalData.DataSubjectRole : 'Customer',
  PersonalData.EntitySemantics : 'Other'
) {
  createdBy   @PersonalData.FieldSemantics : 'DataSubjectID';
  sentDate    @PersonalData.FieldSemantics : 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics : 'DataControllerID';
};

annotate UserNewsletters with @Capabilities.FilterRestrictions.Filterable : true;

annotate Newsletters.Attachments with {
  fileName @PersonalData.IsPotentiallyPersonal;
};
