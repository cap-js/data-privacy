const cds = require("@sap/cds");
const path = require("path");

let { GET: _GET, POST: _POST, data } = cds.test().in(path.join(__dirname, "../bookshop-app"));
const POST = async function () {
  try {
    return await _POST(...arguments);
  } catch (e) {
    return e.response ?? e;
  }
};
const GET = async function () {
  try {
    return await _GET(...arguments);
  } catch (e) {
    return e.response ?? e;
  }
};
const DPI_Service = { username: "dpi", password: "1234" };

const CUSTOM_ILM_NAME = "CustomILMName";
const CUSTOMER_ID = "8e2f2640-6866-4dcf-8f4d-3027aa831cad";

async function runWithPrivileged(fn) {
  const user = new cds.User({ id: "privileged", roles: {} });
  user._is_privileged = true;
  const ctx = cds.EventContext.for({ id: cds.utils.uuid(), http: { req: null, res: null } });
  ctx.user = user;
  return await cds._with(ctx, () => fn());
}

beforeEach(async () => {
  await runWithPrivileged(data.reset);
});

describe("data subject deletion with @ILM.ObjectName", () => {
  describe("ILM.ObjectName resolution", () => {
    test("discovery endpoint returns custom ILM name", async () => {
      const { status, data } = await GET("/dpp/retention/iLMObjects", { auth: DPI_Service });
      expect(status).toEqual(200);
      const customObj = data.find((d) => d.iLMObjectName === CUSTOM_ILM_NAME);
      expect(customObj).toBeTruthy();
      expect(customObj.iLMObjectName).toEqual(CUSTOM_ILM_NAME);
      // The CDS entity name should NOT appear as an iLMObjectName
      const byEntityName = data.find((d) => d.iLMObjectName === "ILMObjectWithCustomName");
      expect(byEntityName).toBeUndefined();
    });

    test("using CDS entity name as iLMObjectName returns 400", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectEndOfBusiness",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "ILMObjectWithCustomName",
          dataSubjectRoleName: "Customer",
          dataSubjectId: CUSTOMER_ID
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(400);
      expect(data.error.code).toEqual("ILM_OBJECT_DOES_NOT_EXIST");
    });
  });

  describe("deletion", () => {
    test("dataSubjectEndOfBusiness returns true if all objects have reached end of business", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectEndOfBusiness",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: CUSTOM_ILM_NAME,
          dataSubjectRoleName: "Customer",
          dataSubjectId: CUSTOMER_ID
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data).toMatchObject({
        dataSubjectExpired: true,
        dataSubjectNotExpiredReason: expect.any(String)
      });
    });

    test("dataSubjectOrganizationAttributeValues returns attribute values", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectOrganizationAttributeValues",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: CUSTOM_ILM_NAME,
          dataSubjectRoleName: "Customer",
          dataSubjectId: CUSTOMER_ID,
          organizationAttributeName: "sap.ilm.RetentionService.LegalEntities"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toMatchObject({
        organizationAttributeValue: "SAP Ltd"
      });
    });

    test("dataSubjectLatestRetentionStartDates", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectLatestRetentionStartDates",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: CUSTOM_ILM_NAME,
          dataSubjectRoleName: "Customer",
          dataSubjectId: CUSTOMER_ID,
          organizationAttributeName: "sap.capire.bookshop.LegalEntities",
          organizationAttributeValue: "SAP Ltd",
          referenceDateName: "marketingDate",
          retentionSet: [
            {
              retentionSetId: "ABC",
              conditionSet: []
            }
          ]
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data.length).toEqual(1);
      expect(data[0]).toMatchObject({
        retentionSetId: "ABC",
        retentionStartDate: "2020-04-04T00:00:00"
      });
    });

    test("dataSubjectILMObjectInstanceBlocking returns amount of blocked instances", async () => {
      const { ILMObjectWithCustomName } = cds.entities("sap.capire.bookshop");
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectILMObjectInstanceBlocking",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: CUSTOM_ILM_NAME,
          dataSubjectRoleName: "Customer",
          dataSubjectId: CUSTOMER_ID,
          maxDeletionDate: "2020-04-04T22:00:00"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data).toEqual(1);
      const entitiesAfterBlocking = await runWithPrivileged(() =>
        cds.run(
          SELECT.from(ILMObjectWithCustomName).where({
            Customer_ID: CUSTOMER_ID
          })
        )
      );
      expect(entitiesAfterBlocking.length).toEqual(1);
      expect(
        entitiesAfterBlocking[0][ILMObjectWithCustomName._dpi.blockingDateReference].startsWith(
          new Date().toISOString().substring(0, 10)
        )
      ).toBeTruthy();
      expect(
        entitiesAfterBlocking[0][
          ILMObjectWithCustomName._dpi.earliestDestructionDateReference
        ].startsWith("2020-04-04")
      ).toBeTruthy();
    });

    test("dataSubjectsILMObjectInstancesDestroying", async () => {
      const { ILMObjectWithCustomName } = cds.entities("sap.capire.bookshop");
      await POST(
        "/dpp/retention/dataSubjectILMObjectInstanceBlocking",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: CUSTOM_ILM_NAME,
          dataSubjectRoleName: "Customer",
          dataSubjectId: CUSTOMER_ID,
          maxDeletionDate: "2020-04-04T22:00:00"
        },
        { auth: DPI_Service }
      );
      const blockingBeforeDelete = await runWithPrivileged(() =>
        cds.run(
          SELECT.from(ILMObjectWithCustomName).where({
            Customer_ID: CUSTOMER_ID
          })
        )
      );
      expect(blockingBeforeDelete.length).toEqual(1);
      expect(
        blockingBeforeDelete[0][ILMObjectWithCustomName._dpi.blockingDateReference]
      ).toBeTruthy();
      expect(
        blockingBeforeDelete[0][ILMObjectWithCustomName._dpi.earliestDestructionDateReference]
      ).toEqual("2020-04-04");

      await POST(
        "/dpp/retention/dataSubjectsILMObjectInstancesDestroying",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: CUSTOM_ILM_NAME,
          dataSubjectRoleName: "Customer"
        },
        { auth: DPI_Service }
      );

      const blockingAfter = await runWithPrivileged(() =>
        cds.run(
          SELECT.from(ILMObjectWithCustomName).where({
            Customer_ID: CUSTOMER_ID
          })
        )
      );
      expect(blockingAfter.length).toEqual(0);
    });
  });

  describe("eligible for deletion", () => {
    test("dataSubjectsEndOfResidence returns eligible data subjects for deletion", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidence",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: CUSTOM_ILM_NAME,
          dataSubjectRoleName: "Customer",
          referenceDates: [
            {
              referenceDateName: "marketingDate",
              organizationAttributeResidenceSet: [
                {
                  organizationAttributeName: "sap.capire.bookshop.LegalEntities",
                  organizationAttributeValue: "SAP Ltd",
                  residenceSet: [
                    {
                      retentionStartDate: "2024-12-20",
                      conditionSet: []
                    }
                  ]
                }
              ]
            }
          ]
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data).toMatchObject({
        success: expect.arrayContaining([{ dataSubjectId: CUSTOMER_ID }]),
        nonConfirmCondition: []
      });
    });

    test("dataSubjectsEndOfResidenceConfirmation confirms data subjects end of residence", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidenceConfirmation",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: CUSTOM_ILM_NAME,
          dataSubjectRoleName: "Customer",
          referenceDates: [
            {
              referenceDateName: "marketingDate",
              organizationAttributeResidenceSet: [
                {
                  organizationAttributeName: "sap.capire.bookshop.LegalEntities",
                  organizationAttributeValue: "SAP Ltd",
                  residenceSet: [
                    {
                      retentionStartDate: "2024-12-20",
                      conditionSet: []
                    }
                  ]
                }
              ]
            }
          ],
          dataSubjects: [{ dataSubjectId: CUSTOMER_ID }]
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data.length).toEqual(1);
      expect(data[0]).toMatchObject({
        dataSubjectId: CUSTOMER_ID
      });
    });
  });
});
