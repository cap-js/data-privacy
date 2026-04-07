const cds = require("@sap/cds");
const path = require("path");

cds.test().in(path.join(__dirname, "../bookshop-app"));

describe("Model validations to ensure a working model for DPI", () => {
  let log = cds.test.log();
  test("Error if association targeting DataSubject exists but entity is no iLMObject", async () => {
    await cds.load([
      "../csn-enhancements/scenarios/missingILMObjectMarker.cds",
      "@sap/cds-dpi/srv/DPIInformation",
      "@sap/cds-dpi/srv/TableHeaderBlocking"
    ]);
    expect(log.output.length).toBeGreaterThan(0);
    expect(log.output).toContain("but is not marked as transactional data!");
  });

  test("Error if entity has two org attributes", async () => {
    await cds.load([
      "../csn-enhancements/scenarios/orgAttributes.cds",
      "@sap/cds-dpi/srv/DPIInformation",
      "@sap/cds-dpi/srv/TableHeaderBlocking"
    ]);
    expect(log.output.length).toBeGreaterThan(0);
    expect(log.output).toContain("has multiple organization attributes configured");
  });

  test("Error if a property has two PersonalData.FieldSemantics annotations", async () => {
    await cds.load([
      "../csn-enhancements/scenarios/overlappingAnnotations.cds",
      "@sap/cds-dpi/srv/DPIInformation",
      "@sap/cds-dpi/srv/TableHeaderBlocking"
    ]);
    expect(log.output.length).toBeGreaterThan(0);
    expect(log.output).toContain(
      "has multiple @PersonalData.FieldSemantics annotations. Only one is allowed!"
    );
  });

  test("Error if a property has @ILM.FieldSemantics : LineOrg but conflicting PersonalData.FieldSemantics annotation", async () => {
    await cds.load([
      "../csn-enhancements/scenarios/overlappingAnnotations.cds",
      "@sap/cds-dpi/srv/DPIInformation",
      "@sap/cds-dpi/srv/TableHeaderBlocking"
    ]);
    expect(log.output.length).toBeGreaterThan(0);
    expect(log.output).toContain(
      `is annotated with @ILM.FieldSemantics : 'LineOrganizationID' but also a conflicting @PersonalData.FieldSemantics annotation! Please remove either of them!`
    );
  });

  test("Error if a property has @ILM.FieldSemantics : ProcessOrg but conflicting PersonalData.FieldSemantics annotation", async () => {
    await cds.load([
      "../csn-enhancements/scenarios/overlappingAnnotations.cds",
      "@sap/cds-dpi/srv/DPIInformation",
      "@sap/cds-dpi/srv/TableHeaderBlocking"
    ]);
    expect(log.output.length).toBeGreaterThan(0);
    expect(log.output).toContain(
      `is annotated with @ILM.FieldSemantics : 'ProcessOrganizationID' but also a conflicting @PersonalData.FieldSemantics annotation! Please remove either of them!`
    );
  });

  test("No error when @PersonalData.FieldSemantics : EndOfBusinessDate and DataControllerID is only added in RetentionService", async () => {
    await cds.load([
      "../csn-enhancements/scenarios/entityAttributeOnlyInExtend.cds",
      "@sap/cds-dpi/srv/DPIInformation",
      "@sap/cds-dpi/srv/TableHeaderBlocking"
    ]);
    expect(log.output.length).toBeGreaterThan(0);
    expect(log.output).not.toContain(`Error`);
  });

  test("No error when only @ILM.FieldSemantics : LineOrganizationID is given", async () => {
    await cds.load([
      "../csn-enhancements/scenarios/onlyILMAnnotations.cds",
      "@sap/cds-dpi/srv/DPIInformation",
      "@sap/cds-dpi/srv/TableHeaderBlocking"
    ]);
    expect(log.output.length).toBeGreaterThan(0);
    expect(log.output).not.toContain(
      `a conflicting @PersonalData.FieldSemantics annotation! Please remove either of them!`
    );
  });

  describe("Data type validations for field semantics", () => {
    test("LargeBinary is not supported for any PersonalData field", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.LargeBinary";
      const entityName = "InvalidILMObject1";
      expect(log.output).toContain(
        `The data type (${dataType}) of legalEntity of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `The data type (${dataType}) of customer of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `endOfBusiness of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `deletion of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `blocking of ${entityName} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
    });

    test("LargeString is not supported for any PersonalData field", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.LargeString";
      const entityName = "InvalidILMObject2";
      expect(log.output).toContain(
        `The data type (${dataType}) of legalEntity of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `The data type (${dataType}) of customer of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `endOfBusiness of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `deletion of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `blocking of ${entityName} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
    });

    test("Map is not supported for any PersonalData field", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.Map";
      const entityName = "InvalidILMObject6";
      expect(log.output).toContain(
        `The data type (${dataType}) of legalEntity of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `The data type (${dataType}) of customer of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `endOfBusiness of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `deletion of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `blocking of ${entityName} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
    });

    test("Date types are not supported for PersonalData reference fields", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.Date";
      const entityName = "InvalidILMObject3";
      expect(log.output).toContain(
        `The data type (${dataType}) of legalEntity of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `The data type (${dataType}) of customer of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );

      const dataType2 = "cds.DateTime";
      const entityName2 = "InvalidILMObject4";
      expect(log.output).toContain(
        `The data type (${dataType2}) of legalEntity of ${entityName2} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `The data type (${dataType2}) of customer of ${entityName2} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );

      const dataType3 = "cds.Timestamp";
      const entityName3 = "InvalidILMObject5";
      expect(log.output).toContain(
        `The data type (${dataType3}) of legalEntity of ${entityName3} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `The data type (${dataType3}) of customer of ${entityName3} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
    });

    test("Regular types are supported for PersonalData reference fields", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.String";
      const entityName = "ValidILMObject1";
      expect(log.output).not.toContain(
        `The data type (${dataType}) of legalEntity of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).not.toContain(
        `The data type (${dataType}) of customer of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );

      const dataType2 = "cds.Integer";
      const entityName2 = "ValidILMObject2";
      expect(log.output).not.toContain(
        `The data type (${dataType2}) of legalEntity of ${entityName2} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).not.toContain(
        `The data type (${dataType2}) of customer of ${entityName2} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );

      const dataType3 = "cds.Double";
      const entityName3 = "ValidILMObject4";
      expect(log.output).not.toContain(
        `The data type (${dataType3}) of legalEntity of ${entityName3} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).not.toContain(
        `The data type (${dataType3}) of customer of ${entityName3} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
    });

    test("Strings are not supported for PersonalData date fields", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.String";
      const entityName = "InvalidILMObject3";
      expect(log.output).toContain(
        `endOfBusiness of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `deletion of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `blocking of ${entityName} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
    });

    test("Time is not supported for PersonalData date fields", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.Time";
      const entityName = "InvalidILMObject4";
      expect(log.output).toContain(
        `endOfBusiness of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `deletion of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `blocking of ${entityName} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
    });

    test("UUIDs are not supported for PersonalData date fields", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.UUID";
      const entityName = "InvalidILMObject5";
      expect(log.output).toContain(
        `endOfBusiness of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `deletion of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `blocking of ${entityName} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
    });

    test("Date fields are supported for PersonalData date fields", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.Date";
      const entityName = "ValidILMObject1";
      expect(log.output).not.toContain(
        `endOfBusiness of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).not.toContain(
        `deletion of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).not.toContain(
        `blocking of ${entityName} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );

      const dataType2 = "cds.Date";
      const entityName2 = "ValidILMObject1";
      expect(log.output).not.toContain(
        `endOfBusiness of ${entityName2} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType2}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).not.toContain(
        `deletion of ${entityName2} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType2}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).not.toContain(
        `blocking of ${entityName2} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType2}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );

      const dataType3 = "cds.Date";
      const entityName3 = "ValidILMObject1";
      expect(log.output).not.toContain(
        `endOfBusiness of ${entityName3} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType3}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).not.toContain(
        `deletion of ${entityName3} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType3}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).not.toContain(
        `blocking of ${entityName3} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType3}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
    });

    test("Binary is not supported for any PersonalData field", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.Binary";
      const entityName = "InvalidILMObject8";
      expect(log.output).toContain(
        `The data type (${dataType}) of legalEntity of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `The data type (${dataType}) of customer of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `endOfBusiness of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `deletion of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `blocking of ${entityName} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
    });

    test("Custom types are correctly resolved", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.LargeBinary";
      const entityName = "InvalidILMObject7";
      expect(log.output).toContain(
        `The data type (${dataType}) of legalEntity of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `The data type (${dataType}) of customer of ${entityName} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `endOfBusiness of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `deletion of ${entityName} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).toContain(
        `blocking of ${entityName} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );

      const dataType2 = "cds.String";
      const dataType3 = "cds.Date";
      const entityName2 = "ValidILMObject4";
      expect(log.output).not.toContain(
        `The data type (${dataType2}) of legalEntity of ${entityName2} is not supported for @PersonalData.FieldSemantics : 'DataControllerID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).not.toContain(
        `The data type (${dataType2}) of customer of ${entityName2} is not supported for @PersonalData.FieldSemantics : 'DataSubjectID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).not.toContain(
        `endOfBusiness of ${entityName2} is annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate' but the data type (${dataType3}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).not.toContain(
        `deletion of ${entityName2} is annotated with @PersonalData.FieldSemantics : 'EndOfRetentionDate' but the data type (${dataType3}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
      expect(log.output).not.toContain(
        `blocking of ${entityName2} is annotated with @PersonalData.FieldSemantics : 'BlockingDate' but the data type (${dataType3}) does not match one of the required data types: cds.Date, cds.DateTime, cds.Timestamp`
      );
    });

    test("ILM.FieldSemantics are checked for type correctness", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/invalidDataTypes.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      const dataType = "cds.Binary";
      const entityName = "InvalidILMObject9";
      expect(log.output).toContain(
        `The data type (${dataType}) of legalEntity of ${entityName} is not supported for @ILM.FieldSemantics : 'LineOrganizationID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
      expect(log.output).toContain(
        `The data type (${dataType}) of purpose of ${entityName} is not supported for @ILM.FieldSemantics : 'ProcessOrganizationID'! Unsupported data types: cds.LargeBinary, cds.Binary, cds.Date, cds.DateTime, cds.Timestamp, cds.Map, cds.LargeString`
      );
    });
  });

  describe("Entity semantics validation", () => {
    test("Error in case entity has EntitySemantics but not DataSubjectRole", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/entitySemantics.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      expect(log.output).toContain(
        `${"MissingDSRole"} is annotated with @PersonalData.EntitySemantics but is lacking the @PersonalData.DataSubjectRole annotation!`
      );
    });

    test("Error in case entity has DataSubjectRole but not EntitySemantics", async () => {
      await cds.load([
        "../csn-enhancements/scenarios/entitySemantics.cds",
        "@sap/cds-dpi/srv/DPIInformation",
        "@sap/cds-dpi/srv/TableHeaderBlocking"
      ]);
      expect(log.output.length).toBeGreaterThan(0);
      expect(log.output).toContain(
        `${"MissingEntitySemantics"} is annotated with @PersonalData.DataSubjectRole but is lacking the @PersonalData.EntitySemantics annotation!`
      );
    });

    describe("Data subject compositions are only DS details", () => {
      test("Warning in case composition does not point to a DS Details entity", async () => {
        await cds.load([
          "../csn-enhancements/scenarios/dataSubjectsStructure.cds",
          "@sap/cds-dpi/srv/DPIInformation",
          "@sap/cds-dpi/srv/TableHeaderBlocking"
        ]);
        expect(log.output.length).toBeGreaterThan(0);
        expect(log.output).toContain(
          `\n[data-privacy] - The composition compToTransactional of the data subject DS points to sap.ilm.bookshop.Orders.`
        );
      });

      test("Warning in case composition of DS details composition does not point to a DS Details entity", async () => {
        await cds.load([
          "../csn-enhancements/scenarios/dataSubjectsStructure.cds",
          "@sap/cds-dpi/srv/DPIInformation",
          "@sap/cds-dpi/srv/TableHeaderBlocking"
        ]);
        expect(log.output.length).toBeGreaterThan(0);
        expect(log.output).toContain(
          `\n[data-privacy] - The composition compDsDetails.compToOrdersInDSDetails of the data subject DS points to sap.ilm.bookshop.Orders.`
        );
      });

      test("No warning for association to transactional data", async () => {
        await cds.load([
          "../csn-enhancements/scenarios/dataSubjectsStructure.cds",
          "@sap/cds-dpi/srv/DPIInformation",
          "@sap/cds-dpi/srv/TableHeaderBlocking"
        ]);
        expect(log.output.length).toBeGreaterThan(0);
        expect(log.output).not.toContain(
          `\n[data-privacy] - The composition associatedOrders of the data subject DS points to sap.ilm.bookshop.Orders.`
        );
      });

      test("No warning for composition to DS details", async () => {
        await cds.load([
          "../csn-enhancements/scenarios/dataSubjectsStructure.cds",
          "@sap/cds-dpi/srv/DPIInformation",
          "@sap/cds-dpi/srv/TableHeaderBlocking"
        ]);
        expect(log.output.length).toBeGreaterThan(0);
        expect(log.output).not.toContain(
          `\n[data-privacy] - The composition compDsDetails of the data subject DS points to DSDetails.`
        );
      });
    });

    describe("Dynamic role validations", () => {
      test("Error in case dynamic role path contains a to many segment", async () => {
        await cds.load([
          "../csn-enhancements/scenarios/entitySemantics.cds",
          "@sap/cds-dpi/srv/DPIInformation",
          "@sap/cds-dpi/srv/TableHeaderBlocking"
        ]);
        expect(log.output.length).toBeGreaterThan(0);
        expect(log.output).toContain(
          `Cannot resolve the @PersonalData.DataSubjectRole path "details.role" of ${"DynamicDSRoleWithInvalidPath"}. "details" is a to many relation, which cannot be used!`
        );
      });

      test("Error in case dynamic role path is missing enum", async () => {
        await cds.load([
          "../csn-enhancements/scenarios/entitySemantics.cds",
          "@sap/cds-dpi/srv/DPIInformation",
          "@sap/cds-dpi/srv/TableHeaderBlocking"
        ]);
        expect(log.output.length).toBeGreaterThan(0);
        expect(log.output).toContain(
          `The @PersonalData.DataSubjectRole path "role" of ${"DynamicDSRoleMissingEnum"} does not point to an enum property. Dynamic role properties must have an enum assigned detailing all possible roles!`
        );
      });

      test("Enum for dynamic role can be behind custom type", async () => {
        await cds.load([
          "../csn-enhancements/scenarios/entitySemantics.cds",
          "@sap/cds-dpi/srv/DPIInformation",
          "@sap/cds-dpi/srv/TableHeaderBlocking"
        ]);
        expect(log.output.length).toBeGreaterThan(0);
        expect(log.output).not.toContain(
          `The @PersonalData.DataSubjectRole path "role" of ${"ValidDynamicDSRoleWithEnum"} does not point to an enum property. Dynamic role properties must have an enum assigned detailing all possible roles!`
        );
      });

      test("Dynamic role can be a path with multiple segments", async () => {
        await cds.load([
          "../csn-enhancements/scenarios/entitySemantics.cds",
          "@sap/cds-dpi/srv/DPIInformation",
          "@sap/cds-dpi/srv/TableHeaderBlocking"
        ]);
        expect(log.output.length).toBeGreaterThan(0);
        expect(log.output).not.toContain(`ValidDynamicDSRoleWithPath`);
      });

      test("Dynamic role paths to enums are possible", async () => {
        await cds.load([
          "../csn-enhancements/scenarios/entitySemantics.cds",
          "@sap/cds-dpi/srv/DPIInformation",
          "@sap/cds-dpi/srv/TableHeaderBlocking"
        ]);
        expect(log.output.length).toBeGreaterThan(0);
        expect(log.output).not.toContain(`ValidDynamicDSRole`);
      });
    });
  });
});
