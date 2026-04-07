const cds = require("@sap/cds");
const path = require("path");

let { GET } = cds.test().in(path.join(__dirname, "../bookshop-app"));
const DPI_Service = { username: "dpi", password: "1234" };

describe("iLMObject discovery", () => {
  test("discovery endpoint is served", async () => {
    const { status, data } = await GET("/dpp/retention/iLMObjects", { auth: DPI_Service });
    expect(status).toEqual(200);
    expect(data.length).toBeGreaterThan(0);
  });

  describe("iLMObject enabled", () => {
    test("ILM Object check endpoint is served", async () => {
      const { status, data } = await GET("/dpp/retention/iLMObjects", { auth: DPI_Service });
      expect(status).toEqual(200);
      for (const iLMObject of data) {
        const { status: statusCheck, data: resultCheck } = await GET(
          iLMObject.iLMObjectCheckEndPoint,
          { auth: DPI_Service }
        );
        expect(statusCheck).toEqual(200);
        expect(resultCheck.isILMObjectEnabled).toEqual(expect.any(Boolean));
      }
    });
    test("ILMObject is enabled by default", async () => {
      const { status, data } = await GET("/dpp/retention/iLMObjects/Orders/isILMObjectEnabled", {
        auth: DPI_Service
      });
      expect(status).toEqual(200);
      expect(data.isILMObjectEnabled).toEqual(true);
    });

    test("ILMObject enablement considers boolean value for @ILM.BlockingEnabled annotation", async () => {
      const { status, data } = await GET(
        "/dpp/retention/iLMObjects/ILMObjectWithStaticBlockingDisabled/isILMObjectEnabled",
        { auth: DPI_Service }
      );
      expect(status).toEqual(200);
      expect(data.isILMObjectEnabled).toEqual(false);
    });

    test("ILMObject enablement considers edmJson path & pointing to different service for @ILM.BlockingEnabled annotation", async () => {
      const { status, data } = await GET(
        "/dpp/retention/iLMObjects/ILMObjectWithEDMJSONBlockingEnabled/isILMObjectEnabled",
        { auth: DPI_Service }
      );
      expect(status).toEqual(200);
      expect(data.isILMObjectEnabled).toEqual(false);
    });

    test("ILMObject enablement considers xpr path for @ILM.BlockingEnabled annotation", async () => {
      const { status, data } = await GET(
        "/dpp/retention/iLMObjects/ILMObjectWithXPRBlockingEnabled/isILMObjectEnabled",
        { auth: DPI_Service }
      );
      expect(status).toEqual(200);
      expect(data.isILMObjectEnabled).toEqual(true);
    });
  });

  describe("Selection criteria", () => {
    // REVISIT: Only relevant once archiving/destruction is added
    test.skip("Selection criteria are correctly determined", async () => {
      const { status, data } = await GET("/dpp/retention/iLMObjects", { auth: DPI_Service });
      expect(status).toEqual(200);
      for (const iLMObject of data) {
        for (const selectionCriteria of iLMObject.destructionConfiguration.selectionCriteria.concat(
          iLMObject.archivingConfiguration?.selectionCriteria ?? []
        )) {
          if (selectionCriteria.selectionCriteriaValueHelpEndPoint) {
            const { status, data } = await GET(
              selectionCriteria.selectionCriteriaValueHelpEndPoint,
              { auth: DPI_Service }
            );
            expect(status).toEqual(200);
            expect(data.length).toBeGreaterThan(0);
            expect(data[0]).toMatchObject({
              value: expect.any(String),
              valueDescription: expect.any(String)
            });
          }
        }
      }
    });

    test("Selection criteria are not generated for ILM / PersonalData field semantics", async () => {
      const { data } = await GET("/dpp/retention", { auth: DPI_Service });
      for (const entity of data.entities) {
        if (entity.name.startsWith("valueHelp_selection")) {
          const nameSegments = entity.name.split("_");
          nameSegments.shift();
          nameSegments.shift();
          const field = nameSegments.pop();
          const entityDef = nameSegments.join(".");
          expect(
            Object.keys(cds.model.definitions[entityDef].elements[field]).some((k) =>
              k.startsWith("@PersonalData.FieldSemantics")
            )
          ).toEqual(false);
          expect(
            Object.keys(cds.model.definitions[entityDef].elements[field]).some((k) =>
              k.startsWith("@ILM.FieldSemantics")
            )
          ).toEqual(false);
        }
      }
    });
  });

  describe("Conditions", () => {
    test("Conditions are correctly determined", async () => {
      const { status, data } = await GET("/dpp/retention/iLMObjects", { auth: DPI_Service });
      expect(status).toEqual(200);
      for (const iLMObject of data) {
        if (!iLMObject.conditions) continue;

        for (const condition of iLMObject.conditions) {
          expect(condition.conditionFieldDescription).toBeTruthy();
          expect(condition.conditionFieldName).toBeTruthy();
          expect(condition.conditionFieldType).toBeTruthy();
          const iLMObjectDef =
            cds.model.definitions[`sap.ilm.RetentionService.${iLMObject.iLMObjectName}`];

          const purposeField =
            iLMObjectDef.elements[
              iLMObjectDef._dpi.elementByVHId(condition.conditionFieldName) ??
                condition.conditionFieldName
            ];
          if (purposeField["@PersonalData.FieldSemantics"]) {
            expect(purposeField["@PersonalData.FieldSemantics"]).toEqual("PurposeID");
          } else {
            expect(purposeField["@ILM.FieldSemantics"]).toEqual("ProcessOrganizationID");
          }
          const { status, data } = await GET(condition.conditionFieldValueHelpEndPoint, {
            auth: DPI_Service
          });
          expect(status).toEqual(200);
          expect(data.length).toBeGreaterThan(0);
          expect(data[0]).toMatchObject({
            conditionFieldValue: expect.any(String),
            conditionFieldValueDescription: expect.any(String)
          });
        }
      }
    });

    test("Conditions are not set if no conditions exist", async () => {
      const { status, data } = await GET("/dpp/retention/iLMObjects", { auth: DPI_Service });
      expect(status).toEqual(200);
      const marketingILMObject = data.find((d) => d.iLMObjectName === "Marketing");
      expect(marketingILMObject.conditions).toBeUndefined();
    });

    test("Conditions are correctly added to iLMObjects", async () => {
      const { data } = await GET("/dpp/retention/iLMObjects", { auth: DPI_Service });

      const iLMObjectWithAssocButVHOrgAttr = data.find(
        (iLMObject) => iLMObject.iLMObjectName === "Exams"
      );
      expect(
        iLMObjectWithAssocButVHOrgAttr.conditions.some(
          (c) => c.conditionFieldName === "test.dpp.university.ExamTypes"
        )
      ).toBeTruthy();
    });
  });

  describe("Org attributes", () => {
    test("test org attribute endpoints", async () => {
      const organizationAttributes = Object.keys(cds.model.definitions).filter((n) =>
        n.startsWith("sap.ilm.RetentionService.valueHelp_orgAttribute")
      );
      for (const attribute of organizationAttributes) {
        const attributeDefinition = cds.model.definitions[attribute];
        const { status, data } = await GET(attributeDefinition["@ILM.ValueHelp.Path"], {
          auth: DPI_Service
        });
        expect(status).toEqual(200);
        expect(data.length).toBeGreaterThan(0);
        expect(data[0]).toMatchObject({
          organizationAttributeValue: expect.any(String),
          organizationAttributeValueDescription: expect.any(String)
        });
      }
    });

    test("Org Attributes are correctly added to iLMObjects", async () => {
      const { data } = await GET("/dpp/retention/iLMObjects", { auth: DPI_Service });

      const iLMObjectWithAssocOrgAttr = data.find(
        (iLMObject) => iLMObject.iLMObjectName === "TranscriptGrades"
      );
      expect(iLMObjectWithAssocOrgAttr.organizationAttributeName).toEqual(
        "test.dpp.university.Universities"
      );

      const iLMObjectWithAssocButVHOrgAttr = data.find(
        (iLMObject) => iLMObject.iLMObjectName === "Exams"
      );
      expect(iLMObjectWithAssocButVHOrgAttr.organizationAttributeName).toEqual("Universities");

      const iLMObjectWithStringButVHOrgAttr = data.find(
        (iLMObject) => iLMObject.iLMObjectName === "ConsultingHours"
      );
      expect(iLMObjectWithStringButVHOrgAttr.organizationAttributeName).toEqual("Universities");

      const iLMObjectWithStringOrgAttr = data.find(
        (iLMObject) => iLMObject.iLMObjectName === "ErasmusApplications"
      );
      expect(iLMObjectWithStringOrgAttr.organizationAttributeName).toEqual("universityStr");
    });
  });
});
