using {cuid, } from '@sap/cds/common';

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity InvalidILMObject1 : cuid {
  legalEntity   : LargeBinary @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : LargeBinary @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : LargeBinary @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : LargeBinary @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : LargeBinary @PersonalData.FieldSemantics: 'BlockingDate';
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity InvalidILMObject2 : cuid {
  legalEntity   : LargeString @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : LargeString @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : LargeString @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : LargeString @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : LargeString @PersonalData.FieldSemantics: 'BlockingDate';
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity InvalidILMObject3 : cuid {
  legalEntity   : Date @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : Date @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : String @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : String @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : String @PersonalData.FieldSemantics: 'BlockingDate';
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity InvalidILMObject4 : cuid {
  legalEntity   : DateTime @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : DateTime @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Time @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : Time @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : Time @PersonalData.FieldSemantics: 'BlockingDate';
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity InvalidILMObject5 : cuid {
  legalEntity   : Timestamp @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : Timestamp @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : UUID @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : UUID @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : UUID @PersonalData.FieldSemantics: 'BlockingDate';
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity InvalidILMObject6 : cuid {
  legalEntity   : Map @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : Map @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Map @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : Map @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : Map @PersonalData.FieldSemantics: 'BlockingDate';
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity ValidILMObject1 : cuid {
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : Date @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : Date @PersonalData.FieldSemantics: 'BlockingDate';
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity ValidILMObject2 : cuid {
  legalEntity   : Integer @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : Integer @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : DateTime @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : DateTime @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : DateTime @PersonalData.FieldSemantics: 'BlockingDate';
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity ValidILMObject3 : cuid {
  legalEntity   : Double @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : Double @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Timestamp @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : Timestamp @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : Timestamp @PersonalData.FieldSemantics: 'BlockingDate';
}

type DRMDate        : Date;
type DRMRef         : String;

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity ValidILMObject4 : cuid {
  legalEntity   : DRMRef @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : DRMRef @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : DRMDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : DRMDate @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : DRMDate @PersonalData.FieldSemantics: 'BlockingDate';
}

type InvalidDRMDate : LargeBinary;
type InvalidDRMRef  : LargeBinary;

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity InvalidILMObject7 : cuid {
  legalEntity   : InvalidDRMRef @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : InvalidDRMRef @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : InvalidDRMDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : InvalidDRMDate @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : InvalidDRMDate @PersonalData.FieldSemantics: 'BlockingDate';
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity InvalidILMObject8 : cuid {
  legalEntity   : Binary(200) @PersonalData.FieldSemantics: 'DataControllerID';
  customer      : Binary(200) @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Binary(200) @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : Binary(200) @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : Binary(200) @PersonalData.FieldSemantics: 'BlockingDate';
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other',
}
entity InvalidILMObject9 : cuid {
  legalEntity   : Binary(200) @ILM.FieldSemantics: 'LineOrganizationID';
  purpose       : Binary(200) @ILM.FieldSemantics: 'ProcessOrganizationID';
  customer      : Binary(200) @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Binary(200) @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  deletion      : Binary(200) @PersonalData.FieldSemantics: 'EndOfRetentionDate';
  blocking      : Binary(200) @PersonalData.FieldSemantics: 'BlockingDate';
}
