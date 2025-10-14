// Proxy for importing schema from bookshop sample
using {sap.capire.bookshop} from './schema';

// annotations for Data Privacy
annotate bookshop.Customers with @(
  PersonalData : {
    DataSubjectRole : 'Customer',
    EntitySemantics : 'DataSubject'
  })
{
  ID           @PersonalData.FieldSemantics : 'DataSubjectID';
  email        @PersonalData.IsPotentiallyPersonal;
  firstName    @PersonalData.IsPotentiallyPersonal;
  lastName     @PersonalData.IsPotentiallyPersonal;
//  creditCardNo @PersonalData.IsPotentiallySensitive;
  dateOfBirth  @PersonalData.IsPotentiallyPersonal;
  legalEntity  @PersonalData.FieldSemantics : 'LegalEntityID';
}

annotate bookshop.CustomerBillingData with @PersonalData : {
  DataSubjectRole : 'Customer',
  EntitySemantics : 'DataSubjectDetails'
} 
{
  Customer  @PersonalData.FieldSemantics : 'DataSubjectID';
  creditCardNo @PersonalData.IsPotentiallySensitive;
}

annotate bookshop.CustomerPostalAddress with @PersonalData : {
  DataSubjectRole : 'Customer',
  EntitySemantics : 'DataSubjectDetails'
} 
{
  Customer @PersonalData.FieldSemantics : 'DataSubjectID';
  street   @PersonalData.IsPotentiallyPersonal;
  town     @PersonalData.IsPotentiallyPersonal;
  country  @PersonalData.IsPotentiallyPersonal;
}

annotate bookshop.Orders with @(
  PersonalData.DataSubjectRole : 'Customer',
  PersonalData.EntitySemantics : 'Other'
)
{
  Customer          @PersonalData.FieldSemantics : 'DataSubjectID';
  endOfWarrantyDate @PersonalData.FieldSemantics : 'EndOfBusinessDate';
  legalEntity       @PersonalData.FieldSemantics : 'LegalEntityID';
}

annotate bookshop.OrderItems with {
  ID          @PersonalData.FieldSemantics : 'ContractRelatedID';
}

annotate bookshop.Marketing with @(
  PersonalData.DataSubjectRole : 'Customer',
  PersonalData.EntitySemantics : 'Other'
) {
  Customer      @PersonalData.FieldSemantics : 'DataSubjectID';
  marketingDate @PersonalData.FieldSemantics : 'EndOfBusinessDate';
  legalEntity   @PersonalData.FieldSemantics : 'LegalEntityID';
};

// UI annotation for DRM
annotate bookshop.Marketing with @(
  UI.SelectionFields : [
    legalEntity_title
  ]);

// DRM annotations - Capabilities 
annotate bookshop.Orders with @(
  Capabilities                 : {
    FilterRestrictions : {
        Filterable : true,
        RequiredProperties : [
            createdAt
        ],
        NonFilterableProperties : [
            Customer_ID
        ],
   FilterExpressionRestrictions : 
     [  {  Property : OrderNo,  AllowedExpressions : 'SingleRange'   } ]  
    }
  }
);

annotate bookshop.Marketing with @(
  Capabilities                 : {
    FilterRestrictions : {
        Filterable : true,
        RequiredProperties : [
            createdAt
        ]
    }
  }
);

// DRM Annotations Communications - needed for Data Subject Information
//                                - needed for PDM selection screen as well
annotate bookshop.Customers with @Communication.Contact : {
  n    : {
    surname : lastName,
    given   : firstName,

  },
  bday : dateOfBirth,
  email : [{
    address : email,
    type : #preferred,
  }],
  gender: gender
};


// annotations for Audit Log
annotate bookshop.Customers with @AuditLog.Operation : {
  Read   : true,
  Insert : true,
  Update : true,
  Delete : true
};

annotate bookshop.CustomerPostalAddress with @AuditLog.Operation : {
  Read   : true,
  Insert : true,
  Update : true,
  Delete : true
};
