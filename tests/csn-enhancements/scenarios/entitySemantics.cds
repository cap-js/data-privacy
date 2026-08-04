using {cuid, } from '@sap/cds/common';

@PersonalData: {DataSubjectRole: 'Customer', }
entity MissingEntitySemantics : cuid {
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
}

@PersonalData: {EntitySemantics: 'Other', }
entity MissingDSRole : cuid {
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
}

@PersonalData: {
  DataSubjectRole: role,
  EntitySemantics: 'Other',
}
entity ValidDynamicDSRole : cuid {
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  role          : String enum {
    Customer = 'Customer'
  }
}

@PersonalData: {
  DataSubjectRole: details.role,
  EntitySemantics: 'Other',
}
entity ValidDynamicDSRoleWithPath : cuid {
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  details       : Composition of one RoleDetails;
}

entity RoleDetails : cuid {
  role : String enum {
    Customer = 'Customer'
  }
}

@PersonalData: {
  DataSubjectRole: role,
  EntitySemantics: 'Other',
}
entity ValidDynamicDSRoleWithEnum : cuid {
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  role          : DataSubjectEnum;
}

type DataSubjectEnum : String enum {
  Customer = 'Customer'
};

@PersonalData: {
  DataSubjectRole: details.role,
  EntitySemantics: 'Other',
}
entity DynamicDSRoleWithInvalidPath : cuid {
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  details       : Composition of many RoleDetails2
                    on details.parent = $self;
}

entity RoleDetails2 : cuid {
  parent : Association to one DynamicDSRoleWithInvalidPath;
  role   : String enum {
    Customer = 'Customer'
  }
}

@PersonalData: {
  DataSubjectRole: role,
  EntitySemantics: 'Other',
}
entity DynamicDSRoleMissingEnum : cuid {
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  role          : String;
}
