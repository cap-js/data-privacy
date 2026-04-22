const cds = require("@sap/cds");
const path = require("path");

cds.test().in(path.join(__dirname, "../bookshop-app"));

describe("Join and Union view handling", () => {
  let log = cds.test.log();

  test("Join entity does not crash enhanceModel and model is enhanced", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    expect(model.meta["sap.ilm.enhanced"]).toEqual(true);
    expect(model.definitions["sap.ilm.RetentionService"]).toBeTruthy();
    expect(model.definitions["sap.dpp.InformationService"]).toBeTruthy();
    expect(log.output).not.toContain("[ERROR]");
  });

  test("Join entity resolves projection hierarchy to base ILM entity (Orders)", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    // OrdersWithItems is a join on Orders + OrderItems
    // Orders has @PersonalData.EntitySemantics: 'Other' — so it is the base ILM entity
    // OrdersWithItems should NOT be exposed as a separate ILM entity in the retention service
    const ordersWithItems = model.definitions["OrdersWithItems"];
    expect(ordersWithItems).toBeTruthy();
    // Orders should be exposed in the retention service
    expect(model.definitions["sap.ilm.RetentionService.Orders"]).toBeTruthy();
  });

  test("Multi-join entity (OrdersWithManyItemJoins) resolves correctly", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const ordersWithManyJoins = model.definitions["OrdersWithManyItemJoins"];
    expect(ordersWithManyJoins).toBeTruthy();
    // Should not crash and model should still be enhanced
    expect(model.meta["sap.ilm.enhanced"]).toEqual(true);
    expect(log.output).not.toContain("[ERROR]");
  });

  test("Union entity (CustomersUnion) does not crash enhanceModel", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const customersUnion = model.definitions["CustomersUnion"];
    expect(customersUnion).toBeTruthy();
    expect(model.meta["sap.ilm.enhanced"]).toEqual(true);
    expect(log.output).not.toContain("[ERROR]");
  });

  test("Union entity resolves hierarchy to DataSubject base (Customers)", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    // CustomersUnion is a union of Customers — Customers is a DataSubject
    // Customers should be exposed in both DPI services
    expect(model.definitions["sap.ilm.RetentionService.Customers"]).toBeTruthy();
    expect(model.definitions["sap.dpp.InformationService.Customers"]).toBeTruthy();
  });

  test("Join views expose blocking field element for HANA analytic privileges", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const ordersWithItems = model.definitions["OrdersWithItems"];
    expect(ordersWithItems).toBeTruthy();
    // After enhancement, blocking date field should be in elements
    const blockingField = Object.entries(ordersWithItems.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    );
    expect(blockingField).toBeTruthy();
  });

  test("Join views use min() for blocking field in query columns", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const ordersWithItems = model.definitions["OrdersWithItems"];
    expect(ordersWithItems).toBeTruthy();
    const columns = ordersWithItems.query.SELECT.columns;
    // Find the blocking date column — should use min() wrapping
    const blockingFieldName = Object.entries(ordersWithItems.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    )?.[0];
    expect(blockingFieldName).toBeTruthy();
    const minColumn = columns.find((c) => c.func === "min" && c.as === blockingFieldName);
    expect(minColumn).toBeTruthy();
    expect(minColumn.args).toEqual([{ ref: [blockingFieldName] }]);
  });

  test("Join views use min() for end of retention field in query columns", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const ordersWithItems = model.definitions["OrdersWithItems"];
    expect(ordersWithItems).toBeTruthy();
    const columns = ordersWithItems.query.SELECT.columns;
    const retentionFieldName = Object.entries(ordersWithItems.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "EndOfRetentionDate"
    )?.[0];
    expect(retentionFieldName).toBeTruthy();
    const minColumn = columns.find((c) => c.func === "min" && c.as === retentionFieldName);
    expect(minColumn).toBeTruthy();
    expect(minColumn.args).toEqual([{ ref: [retentionFieldName] }]);
  });

  test("Union views expose blocking field in elements", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const customersUnion = model.definitions["CustomersUnion"];
    expect(customersUnion).toBeTruthy();
    // Customers is a DataSubject — blocking field should be propagated
    const blockingField = Object.entries(customersUnion.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    );
    expect(blockingField).toBeTruthy();
  });

  test("Inner join entity resolves correctly and exposes blocking field with min()", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const ordersInnerJoin = model.definitions["OrdersInnerJoin"];
    expect(ordersInnerJoin).toBeTruthy();
    expect(model.meta["sap.ilm.enhanced"]).toEqual(true);
    expect(log.output).not.toContain("[ERROR]");

    // Blocking field should be in elements
    const blockingField = Object.entries(ordersInnerJoin.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    );
    expect(blockingField).toBeTruthy();

    // Should use min() in query columns
    const columns = ordersInnerJoin.query.SELECT.columns;
    const blockingFieldName = blockingField[0];
    const minColumn = columns.find((c) => c.func === "min" && c.as === blockingFieldName);
    expect(minColumn).toBeTruthy();
    expect(minColumn.args).toEqual([{ ref: [blockingFieldName] }]);

    // Retention field should also use min()
    const retentionField = Object.entries(ordersInnerJoin.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "EndOfRetentionDate"
    );
    expect(retentionField).toBeTruthy();
    const retentionMinColumn = columns.find((c) => c.func === "min" && c.as === retentionField[0]);
    expect(retentionMinColumn).toBeTruthy();
  });

  test("Union of nested joins exposes blocking field in elements and each union SELECT", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const ordersJoinUnion = model.definitions["OrdersJoinUnion"];
    expect(ordersJoinUnion).toBeTruthy();
    expect(model.meta["sap.ilm.enhanced"]).toEqual(true);
    expect(log.output).not.toContain("[ERROR]");

    // Blocking field should be in elements
    const blockingField = Object.entries(ordersJoinUnion.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    );
    expect(blockingField).toBeTruthy();
    const blockingFieldName = blockingField[0];

    // Each union SELECT arg should have the blocking field in its columns
    const setArgs = ordersJoinUnion.query.SET.args;
    expect(setArgs.length).toBe(2);
    for (const arg of setArgs) {
      const hasBlocking = arg.SELECT.columns.some((c) => c.ref && c.ref[0] === blockingFieldName);
      expect(hasBlocking).toBeTruthy();
    }

    // Retention field should also be in elements and each union SELECT
    const retentionField = Object.entries(ordersJoinUnion.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "EndOfRetentionDate"
    );
    expect(retentionField).toBeTruthy();
    const retentionFieldName = retentionField[0];
    for (const arg of setArgs) {
      const hasRetention = arg.SELECT.columns.some((c) => c.ref && c.ref[0] === retentionFieldName);
      expect(hasRetention).toBeTruthy();
    }
  });
});
