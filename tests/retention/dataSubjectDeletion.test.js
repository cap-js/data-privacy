const cds = require("@sap/cds");
const path = require("path");

let { POST: _POST, data } = cds.test().in(path.join(__dirname, "../bookshop-app"));
const POST = async function () {
  try {
    return await _POST(...arguments);
  } catch (e) {
    return e.response ?? e;
  }
};
const DPI_Service = { username: "dpi", password: "1234" };

async function runWithPrivileged(fn) {
  const user = new cds.User({ id: "privileged", roles: {} });
  user._is_privileged = true;
  const ctx = cds.EventContext.for({ id: cds.utils.uuid(), http: { req: null, res: null } });
  ctx.user = user;
  return await cds._with(ctx, () => fn());
}

describe("data subject deletion", () => {
  describe("deletion", () => {
    test("dataSubjectEndOfBusiness returns true if all objects have reached end of business", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectEndOfBusiness",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data).toMatchObject({
        dataSubjectExpired: true,
        dataSubjectNotExpiredReason: expect.any(String)
      });
    });

    test("dataSubjectEndOfBusiness returns false if >0 objects have not reached end of business", async () => {
      const { Orders } = cds.entities("sap.capire.bookshop");
      const endOfWarrantyDate = new Date();
      endOfWarrantyDate.setFullYear(endOfWarrantyDate.getFullYear() + 1);
      await UPDATE.entity(Orders).set({ endOfWarrantyDate: endOfWarrantyDate.toISOString() });
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectEndOfBusiness",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data).toMatchObject({
        dataSubjectExpired: false,
        dataSubjectNotExpiredReason: expect.any(String)
      });
    });

    test("dataSubjectOrganizationAttributeValues returns attribute values", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectOrganizationAttributeValues",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
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

    test("dataSubjectOrganizationAttributeValues returns error if org attribute does not exist", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectOrganizationAttributeValues",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          organizationAttributeName: "legalEntity_name"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(400);
      expect(data.error.code).toEqual("ORG_ATTRIBUTE_NOT_EXISTING");
    });

    test("dataSubjectOrganizationAttributeValues returns error if org attribute is not annotated as DataControllerID", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectOrganizationAttributeValues",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          organizationAttributeName: "ID"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(400);
      expect(data.error.code).toEqual("ORG_ATTRIBUTE_NOT_EXISTING");
    });

    test("dataSubjectLatestRetentionStartDates does not crash with made up org attribute", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectLatestRetentionStartDates",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          organizationAttributeName: "ABCDEFG",
          organizationAttributeValue: "SAP Ltd",
          referenceDateName: "endOfWarrantyDate",
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

    test("dataSubjectLatestRetentionStartDates", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectLatestRetentionStartDates",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          organizationAttributeName: "sap.capire.bookshop.LegalEntities",
          organizationAttributeValue: "SAP Ltd",
          referenceDateName: "endOfWarrantyDate",
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
      const { Orders } = cds.entities("sap.capire.bookshop");
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectILMObjectInstanceBlocking",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: "2020-04-04T22:00:00"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data).toEqual(1);
      const orderAfterBlocking = await runWithPrivileged(() =>
        cds.run(
          SELECT.from(Orders)
            .where({ ID: "5e2f2640-6866-4dcf-8f4d-3027aa831cad" })
            .columns((order) => {
              (order`.*`,
                order.Items((item) => {
                  (item`.*`, item.deliveries("*"));
                }),
                order.Payments("*"));
            })
        )
      );
      expect(orderAfterBlocking.length).toEqual(1);
      expect(
        orderAfterBlocking[0][Orders._dpi.blockingDateReference].startsWith(
          new Date().toISOString().substring(0, 10)
        )
      ).toBeTruthy();
      expect(
        orderAfterBlocking[0][Orders._dpi.earliestDestructionDateReference].startsWith("2020-04-04")
      ).toBeTruthy();

      expect(orderAfterBlocking[0].Items.length).toBeGreaterThan(0);
      for (const record of orderAfterBlocking[0].Items) {
        expect(record.dppBlockingDate).toBeTruthy();
        expect(record.deliveries.length).toBeGreaterThan(0);
        for (const record2 of record.deliveries) {
          expect(record2.dppBlockingDate).toBeTruthy();
        }
      }
      expect(orderAfterBlocking[0].Payments.length).toBeGreaterThan(0);
      for (const record of orderAfterBlocking[0].Payments) {
        expect(record.dppBlockingDate).toBeTruthy();
      }
    });

    test("dataSubjectILMObjectInstanceBlocking returns amount of blocked instances with custom blocking date", async () => {
      const { ILMObjectWithXPRBlockingEnabled } = cds.entities("sap.capire.bookshop");
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectILMObjectInstanceBlocking",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "ILMObjectWithXPRBlockingEnabled",
          dataSubjectRoleName: "Employee",
          dataSubjectId: "b16e120e-ac78-4433-ad00-8defdb101c40",
          maxDeletionDate: "2020-04-04T22:00:00"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data).toEqual(2);
      const entitiesAfterBlocking = await runWithPrivileged(() =>
        cds.run(
          SELECT.from(ILMObjectWithXPRBlockingEnabled).where({
            employee_ID: "b16e120e-ac78-4433-ad00-8defdb101c40"
          })
        )
      );
      expect(entitiesAfterBlocking.length).toEqual(2);
      expect(
        entitiesAfterBlocking[0].legacyBlockingDate.startsWith(
          new Date().toISOString().substring(0, 10)
        )
      ).toBeTruthy();
      expect(entitiesAfterBlocking[0].legacyDestructionDate.startsWith("2020-04-04")).toBeTruthy();
    });

    test("dataSubjectILMObjectInstanceBlocking returns 204 when no instances where active", async () => {
      const { Orders } = cds.entities("sap.capire.bookshop");
      await DELETE.from(Orders);
      const { status } = await POST(
        "/dpp/retention/dataSubjectILMObjectInstanceBlocking",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: "2020-04-03T22:00:00"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(204);
    });

    test("dataSubjectsILMObjectInstancesDestroying", async () => {
      const { Orders } = cds.entities("sap.capire.bookshop");
      await POST(
        "/dpp/retention/dataSubjectILMObjectInstanceBlocking",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: "2020-04-04T22:00:00"
        },
        { auth: DPI_Service }
      );
      const blockingBeforeDelete = await runWithPrivileged(() =>
        cds.run(SELECT.from(Orders).where({ ID: "5e2f2640-6866-4dcf-8f4d-3027aa831cad" }))
      );
      expect(blockingBeforeDelete.length).toEqual(1);
      expect(blockingBeforeDelete[0][Orders._dpi.blockingDateReference]).toBeTruthy();
      expect(blockingBeforeDelete[0][Orders._dpi.earliestDestructionDateReference]).toEqual(
        "2020-04-04"
      );

      await POST(
        "/dpp/retention/dataSubjectsILMObjectInstancesDestroying",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer"
        },
        { auth: DPI_Service }
      );

      const blockingAfter = await runWithPrivileged(() =>
        cds.run(SELECT.from(Orders).where({ ID: "5e2f2640-6866-4dcf-8f4d-3027aa831cad" }))
      );
      expect(blockingAfter.length).toEqual(0);
    });

    test("dataSubjectsILMObjectInstanceBlocking and dataSubjectsILMObjectInstancesDestroying covers compositions of one", async () => {
      const { Orders, ManagedComp2One, UnmanagedComp2One2 } = cds.entities("sap.capire.bookshop");
      await POST(
        "/dpp/retention/dataSubjectILMObjectInstanceBlocking",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: "2020-04-04T22:00:00"
        },
        { auth: DPI_Service }
      );
      const blockingBeforeDelete = await runWithPrivileged(() =>
        cds.run(
          SELECT.from(Orders)
            .where({ ID: "5e2f2640-6866-4dcf-8f4d-3027aa831cad" })
            .columns((o) => {
              (o("*"),
                o.managedComp2one("*"),
                /**o.unmanagedComp2one('*'),*/ o.unmanagedComp2one2("*"));
            })
        )
      );
      expect(blockingBeforeDelete.length).toEqual(1);
      expect(blockingBeforeDelete[0][Orders._dpi.blockingDateReference]).toBeTruthy();
      expect(blockingBeforeDelete[0][Orders._dpi.earliestDestructionDateReference]).toEqual(
        "2020-04-04"
      );

      expect(
        blockingBeforeDelete[0].managedComp2one[ManagedComp2One._dpi.blockingDateReference]
      ).toBeTruthy();
      //expect(blockingBeforeDelete[0].unmanagedComp2one[Comp2One._dpi.blockingDateReference]).toBeTruthy();
      expect(
        blockingBeforeDelete[0].unmanagedComp2one2[UnmanagedComp2One2._dpi.blockingDateReference]
      ).toBeTruthy();

      await POST(
        "/dpp/retention/dataSubjectsILMObjectInstancesDestroying",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer"
        },
        { auth: DPI_Service }
      );

      const blockingAfter = await runWithPrivileged(() =>
        cds.run([
          SELECT.from(Orders).where({ ID: "5e2f2640-6866-4dcf-8f4d-3027aa831cad" }),
          SELECT.from(ManagedComp2One).where({ ID: blockingBeforeDelete[0].managedComp2one.ID }),
          //SELECT.from(UnmanagedComp2One).where({ ID: blockingBeforeDelete[0].unmanagedComp2one.ID}),
          SELECT.from(UnmanagedComp2One2).where({
            ID: blockingBeforeDelete[0].unmanagedComp2one2.ID
          })
        ])
      );
      expect(blockingAfter[0].length).toEqual(0);
      expect(blockingAfter[1].length).toEqual(0);
      expect(blockingAfter[2].length).toEqual(0);
      //expect(blockingAfter[3].length).toEqual(0);
    });

    test("dataSubjectsILMObjectInstancesDestroying executed twice", async () => {
      const { Orders } = cds.entities("sap.capire.bookshop");
      await POST(
        "/dpp/retention/dataSubjectILMObjectInstanceBlocking",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: "2020-04-04T22:00:00"
        },
        { auth: DPI_Service }
      );
      const blockingBeforeDelete = await runWithPrivileged(() =>
        cds.run(SELECT.from(Orders).where({ ID: "5e2f2640-6866-4dcf-8f4d-3027aa831cad" }))
      );
      expect(blockingBeforeDelete.length).toEqual(1);
      expect(blockingBeforeDelete[0][Orders._dpi.blockingDateReference]).toBeTruthy();
      expect(blockingBeforeDelete[0][Orders._dpi.earliestDestructionDateReference]).toEqual(
        "2020-04-04"
      );

      await POST(
        "/dpp/retention/dataSubjectsILMObjectInstancesDestroying",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer"
        },
        { auth: DPI_Service }
      );

      const blockingAfter = await runWithPrivileged(() =>
        cds.run(SELECT.from(Orders).where({ ID: "5e2f2640-6866-4dcf-8f4d-3027aa831cad" }))
      );
      expect(blockingAfter.length).toEqual(0);

      const { status } = await POST(
        "/dpp/retention/dataSubjectsILMObjectInstancesDestroying",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer"
        },
        { auth: DPI_Service }
      );
      expect(status).toEqual(202);
    });

    test("dataSubjectsILMObjectInstancesDestroying with custom destruction date", async () => {
      const { ILMObjectWithXPRBlockingEnabled } = cds.entities("sap.capire.bookshop");
      await POST(
        "/dpp/retention/dataSubjectILMObjectInstanceBlocking",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "ILMObjectWithXPRBlockingEnabled",
          dataSubjectRoleName: "Employee",
          dataSubjectId: "b16e120e-ac78-4433-ad00-8defdb101c40",
          maxDeletionDate: "2020-04-04T22:00:00"
        },
        { auth: DPI_Service }
      );
      const blockingBeforeDelete = await runWithPrivileged(() =>
        cds.run(
          SELECT.from(ILMObjectWithXPRBlockingEnabled).where({
            ID: "375ce788-e470-449f-ac81-86e433f8690d"
          })
        )
      );
      expect(blockingBeforeDelete.length).toEqual(1);
      expect(blockingBeforeDelete[0].legacyBlockingDate).toBeTruthy();
      expect(blockingBeforeDelete[0].legacyDestructionDate).toEqual("2020-04-04");

      await POST(
        "/dpp/retention/dataSubjectsILMObjectInstancesDestroying",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "ILMObjectWithXPRBlockingEnabled",
          dataSubjectRoleName: "Employee"
        },
        { auth: DPI_Service }
      );

      const blockingAfter = await runWithPrivileged(() =>
        cds.run(
          SELECT.from(ILMObjectWithXPRBlockingEnabled).where({
            ID: "375ce788-e470-449f-ac81-86e433f8690d"
          })
        )
      );
      expect(blockingAfter.length).toEqual(0);
    });

    test("dataSubjectsILMObjectInstancesDestroying not destroyed if deletion date in future", async () => {
      const { Orders } = cds.entities("sap.capire.bookshop");
      const maxDeletionDate = new Date();
      maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1);
      await POST(
        "/dpp/retention/dataSubjectILMObjectInstanceBlocking",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: maxDeletionDate.toISOString()
        },
        { auth: DPI_Service }
      );
      const blockingBeforeDelete = await runWithPrivileged(() =>
        cds.run(SELECT.from(Orders).where({ ID: "5e2f2640-6866-4dcf-8f4d-3027aa831cad" }))
      );
      expect(blockingBeforeDelete.length).toEqual(1);
      expect(blockingBeforeDelete[0][Orders._dpi.blockingDateReference]).toBeTruthy();
      expect(blockingBeforeDelete[0][Orders._dpi.earliestDestructionDateReference]).toEqual(
        maxDeletionDate.toISOString().substring(0, 10)
      );

      await POST(
        "/dpp/retention/dataSubjectsILMObjectInstancesDestroying",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer"
        },
        { auth: DPI_Service }
      );

      const blockingAfter = await runWithPrivileged(() =>
        cds.run(SELECT.from(Orders).where({ ID: "5e2f2640-6866-4dcf-8f4d-3027aa831cad" }))
      );
      expect(blockingAfter.length).toEqual(1);
      expect(blockingAfter[0][Orders._dpi.blockingDateReference]).toBeTruthy();
      expect(blockingAfter[0][Orders._dpi.earliestDestructionDateReference]).toEqual(
        maxDeletionDate.toISOString().substring(0, 10)
      );
    });

    test("dataSubjectBlocking returns 400 if active records exist", async () => {
      const { status } = await POST(
        "/dpp/retention/dataSubjectBlocking",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: "2020-04-04T22:00:00"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(400);
      const { Orders } = cds.entities("sap.capire.bookshop");
      const orders = await SELECT.from(Orders).where({
        Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      expect(orders.length).toBeGreaterThan(0);
    });

    test("dataSubjectBlocking blocks if maxDeletion date is in future", async () => {
      const {
        Orders,
        Marketing,
        Customers,
        ILMObjectWithStaticBlockingDisabled,
        ILMObjectWithEDMJSONBlockingEnabled,
        ILMObjectWithCustomName
      } = cds.entities("sap.capire.bookshop");
      await UPDATE.entity(Orders)
        .where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" })
        .set({
          [Orders._dpi.blockingDateReference]: new Date().toISOString().substring(0, 10),
          [Orders._dpi.earliestDestructionDateReference]: "2020-01-02T00:00:00Z"
        });
      await UPDATE.entity(Marketing)
        .where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" })
        .set({
          [Marketing._dpi.blockingDateReference]: new Date().toISOString().substring(0, 10),
          [Marketing._dpi.earliestDestructionDateReference]: "2020-01-02T00:00:00Z"
        });
      await UPDATE.entity(ILMObjectWithStaticBlockingDisabled)
        .where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" })
        .set({
          legacyBlockingDate: new Date().toISOString().substring(0, 10),
          [ILMObjectWithStaticBlockingDisabled._dpi.earliestDestructionDateReference]:
            "2020-01-02T00:00:00Z"
        });
      await UPDATE.entity(ILMObjectWithEDMJSONBlockingEnabled)
        .where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" })
        .set({
          [ILMObjectWithEDMJSONBlockingEnabled._dpi.blockingDateReference]: new Date()
            .toISOString()
            .substring(0, 10),
          legacyDestructionDate: "2020-01-02T00:00:00Z"
        });
      await UPDATE.entity(ILMObjectWithCustomName)
        .where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" })
        .set({
          [ILMObjectWithCustomName._dpi.blockingDateReference]: new Date()
            .toISOString()
            .substring(0, 10),
          [ILMObjectWithCustomName._dpi.earliestDestructionDateReference]: "2020-01-02T00:00:00Z"
        });
      const maxDeletionDate = new Date();
      maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1);
      const { status } = await POST(
        "/dpp/retention/dataSubjectBlocking",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: maxDeletionDate.toISOString()
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      const blockingAfter = await runWithPrivileged(() =>
        cds.run(SELECT.from(Customers).where({ ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" }))
      );
      expect(blockingAfter.length).toEqual(1);
      expect(blockingAfter[0][Customers._dpi.blockingDateReference]).toBeTruthy();
      expect(blockingAfter[0][Customers._dpi.earliestDestructionDateReference]).toEqual(
        maxDeletionDate.toISOString().substring(0, 10)
      );
    });

    test("dataSubjectBlocking deletes if maxDeletion date is already past", async () => {
      const {
        Orders,
        Marketing,
        Customers,
        ILMObjectWithStaticBlockingDisabled,
        ILMObjectWithEDMJSONBlockingEnabled,
        ILMObjectWithCustomName
      } = cds.entities("sap.capire.bookshop");
      await DELETE.from(Orders).where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" });
      await DELETE.from(Marketing).where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" });
      await DELETE.from(ILMObjectWithStaticBlockingDisabled).where({
        Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      await DELETE.from(ILMObjectWithEDMJSONBlockingEnabled).where({
        Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      await DELETE.from(ILMObjectWithCustomName).where({
        Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      const { status } = await POST(
        "/dpp/retention/dataSubjectBlocking",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: "2020-01-01"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      const customers = await SELECT.from(Customers).where({
        ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      expect(customers.length).toEqual(0);
    });

    test("dataSubjectBlocking called twice does not return 404", async () => {
      const {
        Orders,
        Marketing,
        Customers,
        ILMObjectWithStaticBlockingDisabled,
        ILMObjectWithEDMJSONBlockingEnabled,
        ILMObjectWithCustomName
      } = cds.entities("sap.capire.bookshop");
      await DELETE.from(Orders).where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" });
      await DELETE.from(Marketing).where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" });
      await DELETE.from(ILMObjectWithStaticBlockingDisabled).where({
        Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      await DELETE.from(ILMObjectWithEDMJSONBlockingEnabled).where({
        Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      await DELETE.from(ILMObjectWithCustomName).where({
        Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      const { status } = await POST(
        "/dpp/retention/dataSubjectBlocking",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: "2020-01-01"
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      const customers = await SELECT.from(Customers).where({
        ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      expect(customers.length).toEqual(0);

      const { status: status2 } = await POST(
        "/dpp/retention/dataSubjectBlocking",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: "2020-01-01"
        },
        { auth: DPI_Service }
      );
      expect(status2).toEqual(200);
    });

    test("dataSubjectBlocking works with custom destruction date", async () => {
      const { ILMObjectWithXPRBlockingEnabled, Employees } = cds.entities("sap.capire.bookshop");
      await UPDATE.entity(ILMObjectWithXPRBlockingEnabled)
        .where({ employee_ID: "b16e120e-ac78-4433-ad00-8defdb101c40" })
        .set({
          legacyBlockingDate: new Date().toISOString().substring(0, 10),
          legacyDestructionDate: "2020-01-02T00:00:00Z"
        });
      const maxDeletionDate = new Date();
      maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1);
      const { status } = await POST(
        "/dpp/retention/dataSubjectBlocking",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Employee",
          dataSubjectId: "b16e120e-ac78-4433-ad00-8defdb101c40",
          maxDeletionDate: maxDeletionDate.toISOString()
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      const blockingAfter = await runWithPrivileged(() =>
        cds.run(SELECT.from(Employees).where({ ID: "b16e120e-ac78-4433-ad00-8defdb101c40" }))
      );
      expect(blockingAfter.length).toEqual(1);
      expect(blockingAfter[0].legacyBlockingDate).toBeTruthy();
      expect(blockingAfter[0].legacyDestructionDate).toEqual(
        maxDeletionDate.toISOString().substring(0, 10)
      );
    });

    test("dataSubjectBlocking does not consider active records with same data subject ID but from different role", async () => {
      const { ILMObjectWithXPRBlockingEnabled, Employees, Orders } =
        cds.entities("sap.capire.bookshop");
      await UPDATE.entity(ILMObjectWithXPRBlockingEnabled)
        .where({ employee_ID: "e872239b-1283-4384-bf14-711e4b18a1b8" })
        .set({
          legacyBlockingDate: new Date().toISOString().substring(0, 10),
          legacyDestructionDate: "2020-01-02T00:00:00Z"
        });
      const orders = await runWithPrivileged(() =>
        cds.run(SELECT.from(Orders).where({ Customer_ID: "e872239b-1283-4384-bf14-711e4b18a1b8" }))
      );
      expect(orders.length).toEqual(1);

      const maxDeletionDate = new Date();
      maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1);
      const { status } = await POST(
        "/dpp/retention/dataSubjectBlocking",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Employee",
          dataSubjectId: "e872239b-1283-4384-bf14-711e4b18a1b8",
          maxDeletionDate: maxDeletionDate.toISOString()
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      const blockingAfter = await runWithPrivileged(() =>
        cds.run(SELECT.from(Employees).where({ ID: "e872239b-1283-4384-bf14-711e4b18a1b8" }))
      );
      expect(blockingAfter.length).toEqual(1);
      expect(blockingAfter[0].legacyBlockingDate).toBeTruthy();
      expect(blockingAfter[0].legacyDestructionDate).toEqual(
        maxDeletionDate.toISOString().substring(0, 10)
      );
    });

    test("dataSubjectsDestroying does not destroy if end of retention not reached", async () => {
      const {
        Orders,
        Marketing,
        Customers,
        ILMObjectWithStaticBlockingDisabled,
        ILMObjectWithEDMJSONBlockingEnabled,
        ILMObjectWithCustomName
      } = cds.entities("sap.capire.bookshop");
      await DELETE.from(Orders).where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" });
      await DELETE.from(Marketing).where({ Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" });
      await DELETE.from(ILMObjectWithStaticBlockingDisabled).where({
        Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      await DELETE.from(ILMObjectWithEDMJSONBlockingEnabled).where({
        Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      await DELETE.from(ILMObjectWithCustomName).where({
        Customer_ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      const maxDeletionDate = new Date();
      maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1);
      await POST(
        "/dpp/retention/dataSubjectBlocking",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Customer",
          dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          maxDeletionDate: maxDeletionDate.toISOString()
        },
        { auth: DPI_Service }
      );

      const blockingBefore = await runWithPrivileged(() =>
        cds.run(SELECT.from(Customers).where({ ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" }))
      );
      expect(blockingBefore.length).toEqual(1);
      expect(blockingBefore[0][Customers._dpi.blockingDateReference]).toBeTruthy();
      expect(blockingBefore[0][Customers._dpi.earliestDestructionDateReference]).toEqual(
        maxDeletionDate.toISOString().substring(0, 10)
      );

      const { status } = await POST(
        "/dpp/retention/dataSubjectsDestroying",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Customer"
        },
        { auth: DPI_Service }
      );
      expect(status).toEqual(204);

      const blockingAfter = await runWithPrivileged(() =>
        cds.run(SELECT.from(Customers).where({ ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" }))
      );
      expect(blockingAfter[0][Customers._dpi.blockingDateReference]).toBeTruthy();
      expect(blockingAfter[0][Customers._dpi.earliestDestructionDateReference]).toEqual(
        maxDeletionDate.toISOString().substring(0, 10)
      );
      expect(blockingAfter.length).toEqual(1);
    });

    test("dataSubjectsDestroying does destroy if end of retention reached with custom destruction date", async () => {
      const { Employees } = cds.entities("sap.capire.bookshop");
      await UPDATE.entity(Employees)
        .where({ ID: "b16e120e-ac78-4433-ad00-8defdb101c40" })
        .set({
          legacyBlockingDate: new Date().toISOString().substring(0, 10),
          legacyDestructionDate: "2020-01-02T00:00:00Z"
        });

      const { status } = await POST(
        "/dpp/retention/dataSubjectsDestroying",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Employee"
        },
        { auth: DPI_Service }
      );
      expect(status).toEqual(200);

      const employeeAfterBlocking = await SELECT.from(Employees).where({
        ID: "b16e120e-ac78-4433-ad00-8defdb101c40"
      });
      expect(employeeAfterBlocking.length).toEqual(0);
    });

    test("dataSubjectsDestroying does destroy if end of retention reached", async () => {
      const { Customers } = cds.entities("sap.capire.bookshop");
      await UPDATE.entity(Customers)
        .where({ ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" })
        .set({
          [Customers._dpi.blockingDateReference]: new Date().toISOString().substring(0, 10),
          [Customers._dpi.earliestDestructionDateReference]: "2020-01-02T00:00:00Z"
        });

      const { status } = await POST(
        "/dpp/retention/dataSubjectsDestroying",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Customer"
        },
        { auth: DPI_Service }
      );
      expect(status).toEqual(200);

      const customerAfterBlocking = await SELECT.from(Customers).where({
        ID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      expect(customerAfterBlocking.length).toEqual(0);
    });
  });

  describe("Validate applicationName", () => {
    test("dataSubjectsEndOfResidenceEndPoint", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidence",
        {
          applicationName: "ABCDEFG",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          referenceDates: [
            {
              referenceDateName: "endOfWarrantyDate",
              organizationAttributeResidenceSet: [
                {
                  organizationAttributeName: "legalEntity_title",
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

      expect(status).toEqual(400);
      expect(data).toMatchObject({
        error: {
          code: "WRONG_APPLICATION_NAME",
          message: expect.any(String),
          target: "applicationName"
        }
      });
    });
  });

  describe("eligible for deletion", () => {
    test("dataSubjectsEndOfResidence does not crash with made up org attribute", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidence",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          referenceDates: [
            {
              referenceDateName: "endOfWarrantyDate",
              organizationAttributeResidenceSet: [
                {
                  organizationAttributeName: "legalEntity_title",
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
        success: [
          { dataSubjectId: "74e718c9-ff99-47f1-8ca3-950c850777d4" },
          { dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" },
          { dataSubjectId: "9e2f2640-6866-4dcf-8f4d-3027aa831cad" }
        ],
        nonConfirmCondition: []
      });
    });

    test("dataSubjectsEndOfResidence returns eligible data subjects for deletion", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidence",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          referenceDates: [
            {
              referenceDateName: "endOfWarrantyDate",
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
        success: [
          { dataSubjectId: "74e718c9-ff99-47f1-8ca3-950c850777d4" },
          { dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" },
          { dataSubjectId: "9e2f2640-6866-4dcf-8f4d-3027aa831cad" }
        ],
        nonConfirmCondition: []
      });
    });

    test("dataSubjectsEndOfResidence properly considers org attribute", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidence",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          referenceDates: [
            {
              referenceDateName: "endOfWarrantyDate",
              organizationAttributeResidenceSet: [
                {
                  organizationAttributeName: "sap.capire.bookshop.LegalEntities",
                  organizationAttributeValue: "SAP SE",
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
        success: [],
        nonConfirmCondition: []
      });
    });

    test("dataSubjectsEndOfResidenceConfirmation does not crash with made up org attribute", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidenceConfirmation",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          referenceDates: [
            {
              referenceDateName: "endOfWarrantyDate",
              organizationAttributeResidenceSet: [
                {
                  organizationAttributeName: "ABCDEFGH",
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
          dataSubjects: [{ dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" }]
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data.length).toEqual(1);
      expect(data[0]).toMatchObject({
        dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
    });

    test("dataSubjectsEndOfResidenceConfirmation confirms data subjects end of residence", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidenceConfirmation",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          referenceDates: [
            {
              referenceDateName: "endOfWarrantyDate",
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
          dataSubjects: [{ dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" }]
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data.length).toEqual(1);
      expect(data[0]).toMatchObject({
        dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
    });

    test("dataSubjectsEndOfResidenceConfirmation returns no data subjects if no data subjects are passed", async () => {
      const { ILMObjectWithXPRBlockingEnabled } = cds.entities("sap.capire.bookshop");
      await DELETE.from(ILMObjectWithXPRBlockingEnabled).where("1 = 1");

      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidenceConfirmation",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "ILMObjectWithXPRBlockingEnabled",
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
          dataSubjects: []
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data.length).toEqual(0);
    });

    test("dataSubjectsEndOfResidenceConfirmation returns the data subjects if they do not have any business with the specified ILMObject", async () => {
      const { ILMObjectWithXPRBlockingEnabled } = cds.entities("sap.capire.bookshop");
      await DELETE.from(ILMObjectWithXPRBlockingEnabled).where("1 = 1");

      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidenceConfirmation",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "ILMObjectWithXPRBlockingEnabled",
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
          dataSubjects: [
            { dataSubjectId: "9e2f2640-6866-4dcf-8f4d-3027aa831cad" },
            { dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" },
            { dataSubjectId: "74e718c9-ff99-47f1-8ca3-950c850777d4" }
          ]
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data.length).toEqual(3);
      expect(data[0]).toMatchObject({
        dataSubjectId: "9e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      expect(data[1]).toMatchObject({
        dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
      expect(data[2]).toMatchObject({
        dataSubjectId: "74e718c9-ff99-47f1-8ca3-950c850777d4"
      });
    });

    test("dataSubjectsEndOfResidence properly considers org attribute", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidenceConfirmation",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          referenceDates: [
            {
              referenceDateName: "endOfWarrantyDate",
              organizationAttributeResidenceSet: [
                {
                  organizationAttributeName: "sap.capire.bookshop.LegalEntities",
                  organizationAttributeValue: "SAP SE",
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
          dataSubjects: [{ dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" }]
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data.length).toEqual(0);
    });

    test("dataSubjectsEndOfResidenceConfirmation with empty reference dates still works", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectsEndOfResidenceConfirmation",
        {
          applicationName: "bookshop-retention",
          iLMObjectName: "Orders",
          dataSubjectRoleName: "Customer",
          referenceDates: [],
          dataSubjects: [{ dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" }]
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data.length).toEqual(1);
      expect(data[0]).toMatchObject({
        dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad"
      });
    });

    //Used for Value helps
    test("dataSubjectInformation retrieval returns data subject information", async () => {
      const { status, data } = await POST(
        "/dpp/retention/dataSubjectInformation",
        {
          applicationName: "bookshop-retention",
          dataSubjectRoleName: "Customer",
          dataSubjects: [{ dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad" }]
        },
        { auth: DPI_Service }
      );

      expect(status).toEqual(200);
      expect(data.length).toEqual(1);
      expect(data[0]).toMatchObject({
        dataSubjectId: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
        name: "John Doe", //Based on @Communication.Contact
        emailId: "john.doe@test.com"
      });
    });
  });
});
