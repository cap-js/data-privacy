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
  // Inline composition — generates Newsletters.Attachments with up_ to Newsletters
  Attachments : Composition of many {
                  key ID       : UUID;
                      fileName : String @title: 'File name';
                      mimeType : String @title: 'MIME type';
                      // Nested inline composition — generates Newsletters.Attachments.Versions with up_ to Newsletters.Attachments
                      Versions : Composition of many {
                                   key ID      : UUID;
                                       version : Integer @title: 'Version number';
                                       comment : String @title: 'Comment';
                                 };
                };
}

// Projection — only this entity has DPI annotations
entity UserNewsletters    as projection on Newsletters
                             where
                               subject != 'INTERNAL';

// Projection with explicit columns (no *) — blocking field must be added to query columns
entity LimitedNewsletters as
  select from UserNewsletters {
    ID,
    createdBy,
    sentDate,
    legalEntity,
    subject
  };


annotate Customers with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'DataSubject'
) {
  ID @PersonalData.FieldSemantics: 'DataSubjectID';
  email @PersonalData.IsPotentiallyPersonal;
  firstName @PersonalData.IsPotentiallyPersonal;
  lastName @PersonalData.IsPotentiallyPersonal;
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate Customers with @Communication.Contact: {
  n: {
    surname: lastName,
    given: firstName
  },
  email: [{
    address: email,
    type: #preferred
  }]
};

// Only the projection gets DPI annotations
annotate UserNewsletters with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other'
) {
  createdBy @PersonalData.FieldSemantics: 'DataSubjectID';
  sentDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate UserNewsletters with @Capabilities.FilterRestrictions.Filterable: true;

annotate LimitedNewsletters with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other'
) {
  createdBy @PersonalData.FieldSemantics: 'DataSubjectID';
  sentDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate LimitedNewsletters with @Capabilities.FilterRestrictions.Filterable: true;

// --- Test: ILM entity -> join -> base entity chain ---
entity Invoices : cuid, managed {
  Customer    : Association to Customers @title: 'Customer';
  invoiceDate : Date @title: 'Invoice date';
  legalEntity : Association to one LegalEntities @title: 'Legal entity';
  amount      : Decimal(15, 2) @title: 'Amount';
}

entity InvoiceItems : cuid {
  parent_ID : UUID;
  product   : String;
  quantity  : Integer;
}

// Join view (no DPI annotations — join gets skipped by index.js)
entity InvoicesWithItems  as
  select from Invoices as inv
  left outer join InvoiceItems as itm
    on itm.parent_ID = inv.ID
  {
    inv.ID,
    inv.Customer,
    inv.invoiceDate,
    inv.legalEntity,
    inv.amount,
    itm.product,
    itm.quantity
  };

// Projection on top of join — this entity gets DPI annotations
// Chain: ProjectedInvoices -> InvoicesWithItems (join) -> Invoices (base)
entity ProjectedInvoices  as projection on InvoicesWithItems
                             where
                               amount > 0;

annotate ProjectedInvoices with @(
  PersonalData.DataSubjectRole: 'Customer',
  PersonalData.EntitySemantics: 'Other'
) {
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  invoiceDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';
};

annotate ProjectedInvoices with @Capabilities.FilterRestrictions.Filterable: true;

annotate Newsletters.Attachments with {
  fileName @PersonalData.IsPotentiallyPersonal;
};
