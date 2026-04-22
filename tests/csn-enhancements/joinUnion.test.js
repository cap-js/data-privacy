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

  test("Join views add blocking field to query columns", async () => {
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
    const blockingFieldName = Object.entries(ordersWithItems.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    )?.[0];
    expect(blockingFieldName).toBeTruthy();
    const blockingCol = columns.find((c) => c.as === blockingFieldName);
    expect(blockingCol).toBeTruthy();
  });

  test("Join views add retention field to query columns with aliased ref", async () => {
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
    const retentionCol = columns.find((c) => c.as === retentionFieldName);
    expect(retentionCol).toBeTruthy();
    // Single source (only Orders) — aliased ref
    expect(retentionCol.ref).toBeTruthy();
    expect(retentionCol.ref[0]).toEqual("o");
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

  test("Inner join entity resolves correctly and exposes blocking field", async () => {
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

    // Blocking field in query columns
    const columns = ordersInnerJoin.query.SELECT.columns;
    const blockingFieldName = blockingField[0];
    const blockingCol = columns.find((c) => c.as === blockingFieldName);
    expect(blockingCol).toBeTruthy();

    // Retention field should also use min()
    const retentionField = Object.entries(ordersInnerJoin.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "EndOfRetentionDate"
    );
    expect(retentionField).toBeTruthy();
    const retentionCol = columns.find((c) => c.as === retentionField[0]);
    expect(retentionCol).toBeTruthy();
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
      const hasBlocking = arg.SELECT.columns.some(
        (c) =>
          c.as === blockingFieldName || (c.ref && c.ref[c.ref.length - 1] === blockingFieldName)
      );
      expect(hasBlocking).toBeTruthy();
    }

    // Retention field should also be in elements and each union SELECT
    const retentionField = Object.entries(ordersJoinUnion.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "EndOfRetentionDate"
    );
    expect(retentionField).toBeTruthy();
    const retentionFieldName = retentionField[0];
    for (const arg of setArgs) {
      const hasRetention = arg.SELECT.columns.some(
        (c) =>
          c.as === retentionFieldName || (c.ref && c.ref[c.ref.length - 1] === retentionFieldName)
      );
      expect(hasRetention).toBeTruthy();
    }
  });

  test("Union of joins uses aliased refs in blocking columns to avoid ambiguity", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const ordersJoinUnion = model.definitions["OrdersJoinUnion"];
    expect(ordersJoinUnion).toBeTruthy();

    const blockingFieldName = Object.entries(ordersJoinUnion.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    )?.[0];
    expect(blockingFieldName).toBeTruthy();

    // Each union arg's FROM is a join — blocking column must NOT use bare { ref: [fieldName] }
    // because that's ambiguous when multiple join sources have the same field.
    // Must use aliased ref or CASE expression.
    for (const arg of ordersJoinUnion.query.SET.args) {
      const blockingCol = arg.SELECT.columns.find(
        (c) =>
          c.as === blockingFieldName || (c.ref && c.ref[c.ref.length - 1] === blockingFieldName)
      );
      expect(blockingCol).toBeTruthy();
      // Must NOT be a bare unaliased ref like { ref: ["dppBlockingDate"] }
      if (blockingCol.ref) {
        expect(blockingCol.ref.length).toBeGreaterThan(1);
      }
    }
  });

  test("Join of two ILM entities uses min(CASE...) for blocking field", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const entity = model.definitions["OrdersWithMarketing"];
    expect(entity).toBeTruthy();
    expect(log.output).not.toContain("[ERROR]");

    const blockingFieldName = Object.entries(entity.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    )?.[0];
    expect(blockingFieldName).toBeTruthy();

    const columns = entity.query.SELECT.columns;
    const caseCol = columns.find((c) => c.xpr && c.as === blockingFieldName);
    expect(caseCol).toBeTruthy();

    // CASE expression picks earliest non-null across both join sources
    expect(caseCol.xpr[0]).toEqual("case");
    const refEntries = caseCol.xpr.filter((x) => x.ref);
    const aliases = [...new Set(refEntries.map((r) => r.ref[0]))];
    expect(aliases).toContain("o");
    expect(aliases).toContain("m");
  });

  test("Join of two ILM entities uses CASE for retention field", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const entity = model.definitions["OrdersWithMarketing"];
    expect(entity).toBeTruthy();

    const retentionFieldName = Object.entries(entity.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "EndOfRetentionDate"
    )?.[0];
    expect(retentionFieldName).toBeTruthy();

    const columns = entity.query.SELECT.columns;
    const caseCol = columns.find((c) => c.xpr && c.as === retentionFieldName);
    expect(caseCol).toBeTruthy();
    expect(caseCol.xpr[0]).toEqual("case");
  });

  test("Join of ILM entity + non-ILM entity uses aliased ref for single-source field", async () => {
    const model = await cds.load([
      "db/schema.cds",
      "db/data-privacy.cds",
      "db/join-union.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
    const entity = model.definitions["OrdersWithItems"];
    expect(entity).toBeTruthy();

    const retentionFieldName = Object.entries(entity.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "EndOfRetentionDate"
    )?.[0];
    expect(retentionFieldName).toBeTruthy();

    const columns = entity.query.SELECT.columns;
    const retentionCol = columns.find((c) => c.as === retentionFieldName);
    expect(retentionCol).toBeTruthy();
    // Only Orders has destruction field — direct aliased ref, no CASE
    expect(retentionCol.ref).toBeTruthy();
    expect(retentionCol.ref[0]).toEqual("o");
    expect(retentionCol.xpr).toBeUndefined();
  });
});
