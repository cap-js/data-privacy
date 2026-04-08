using {cuid} from '@sap/cds/common';

// Rule 1: @ILM.ObjectName must be a string
@ILM.ObjectName: true
entity ILMObjectNameNotString : cuid {
  name : String;
}

// Rule 2: @ILM.ObjectName is ignored if entity is not an ILM Object
@ILM.ObjectName: 'MyObject'
entity ILMObjectNameIgnored : cuid {
  name : String;
}

// Valid: @ILM.ObjectName with @PersonalData.EntitySemantics: 'Other'
@ILM.ObjectName: 'MyObject'
@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other'
}
entity ValidILMObjectNameWithOther : cuid {
  customer      : String @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfBusiness : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity   : String @PersonalData.FieldSemantics: 'DataControllerID';
}

// Valid: @ILM.ObjectName with @ILM.BlockingEnabled
@ILM.ObjectName: 'MyObject'
@ILM.BlockingEnabled: true
entity ValidILMObjectNameWithBlocking : cuid {
  name : String;
}

// Valid: @ILM.ObjectName with @ILM.ArchivingEnabled
@ILM.ObjectName: 'MyObject'
@ILM.ArchivingEnabled: true
entity ValidILMObjectNameWithArchiving : cuid {
  name : String;
}
