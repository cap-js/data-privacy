using {cuid} from '@sap/cds/common';

namespace test.dpp.university;

/**
 * The following schema is used to test:
 * 1. Conditions via @PersonalData.FieldSemantics : 'PurposeID'
 *    - With @Common.ValueList, With Association, With plain String field
 * 2. Organization Attributes via @PersonalData.FieldSemantics: 'Data Controller'
 *    - With @Common.ValueList, With Association, With plain String field
 */


@PersonalData: {
  DataSubjectRole: 'Student',
  EntitySemantics: 'DataSubject',
}
entity Students : cuid {
  firstName : String @PersonalData.IsPotentiallyPersonal;
  lastName  : String @PersonalData.IsPotentiallyPersonal;
}

annotate Students with {
  ID @PersonalData.FieldSemantics: 'DataSubjectID'
}

entity Universities : cuid {
  displayName : String;
}

entity ExamTypes {
  key code : String enum {
        FIRST_TRY = 'FIRST';
        SECOND_TRY = 'SECOND';
        LAST_TRY = 'LAST';
      };
      name : String;
}

@PersonalData: {
  DataSubjectRole: 'Student',
  EntitySemantics: 'Other',
}
entity TranscriptGrades : cuid {
  student           : Association to one Students @PersonalData.FieldSemantics: 'DataSubjectID';
  // No VH and even with same target different OrgAttribute
  university        : Association to one Universities @PersonalData.FieldSemantics: 'DataControllerID';
  grade             : Decimal @PersonalData.IsPotentiallyPersonal;
  exmatriculationAt : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
}

@PersonalData: {
  DataSubjectRole: 'Student',
  EntitySemantics: 'Other',
}
entity Exams : cuid {
  student           : Association to one Students @PersonalData.FieldSemantics: 'DataSubjectID';
  // Assoc and VH and thus VH dictates OrgAttribute
  university        : Association to one Universities  @PersonalData.FieldSemantics: 'DataControllerID'  @Common.ValueList: {
                        CollectionPath: 'Universities',
                        Parameters: [
                          {
                            $Type: 'Common.ValueListParameterInOut',
                            ValueListProperty: 'ID',
                            LocalDataProperty: university_ID,
                          },
                          {
                            $Type: 'Common.ValueListParameterDisplayOnly',
                            ValueListProperty: 'displayName',
                          },
                        ]
                      };
  type              : Association to one ExamTypes @PersonalData.FieldSemantics: 'PurposeID';
  grade             : Decimal @PersonalData.IsPotentiallyPersonal;
  exmatriculationAt : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
}

@PersonalData: {
  DataSubjectRole: 'Student',
  EntitySemantics: 'Other',
}
entity ConsultingHours : cuid {
  student           : Association to one Students @PersonalData.FieldSemantics: 'DataSubjectID';
  // No association and different name but VH and thus same org attribute as Exams
  university2       : String  @PersonalData.FieldSemantics: 'DataControllerID'  @Common.ValueList: {
    CollectionPath: 'Universities',
    Parameters: [
      {
        $Type: 'Common.ValueListParameterInOut',
        ValueListProperty: 'ID',
        LocalDataProperty: university,
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'displayName',
      },
    ]
  };
  remark            : String(5000) @PersonalData.IsPotentiallyPersonal;
  exmatriculationAt : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
}

@PersonalData: {
  DataSubjectRole: 'Student',
  EntitySemantics: 'Other',
}
entity ErasmusApplications : cuid {
  student           : Association to one Students @PersonalData.FieldSemantics: 'DataSubjectID';
  // No ValueList and no Association and thus new org attribute
  universityStr     : String @PersonalData.FieldSemantics: 'DataControllerID';
  application       : String(5000) @PersonalData.IsPotentiallyPersonal;
  exmatriculationAt : Date @PersonalData.FieldSemantics: 'EndOfBusinessDate';
}
