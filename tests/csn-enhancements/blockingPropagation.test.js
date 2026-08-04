const cds = require("@sap/cds");
cds._dpi = { buildMessages: [] };
cds._dpi.log = function log(module, options) {
  return cds.log(module, options);
};
const enhanceModel = require("../../lib/csn-enhancements");

const NS = "test.blockingPropagation";
const DB = "sap.ilm.bookshop";

describe("Blocking field propagation to service views of composition targets", () => {
  let model;
  beforeAll(async () => {
    model = await cds.load([
      "./tests/csn-enhancements/scenarios/base.cds",
      "./tests/csn-enhancements/scenarios/blockingPropagation.cds",
      "./srv/DPIInformation.cds",
      "./srv/TableHeaderBlocking.cds"
    ]);
    enhanceModel(model);
  });

  function expectBlocking(entityName) {
    const entity = model.definitions[entityName];
    expect(entity).toBeTruthy();
    const blockingField = Object.entries(entity.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    );
    expect(blockingField).toBeTruthy();
    return blockingField[0];
  }

  // --- Deep compositions (depth 3) ---

  describe("Deep compositions", () => {
    test("Base entity OrderItems has blocking field", () => {
      expectBlocking(`${DB}.OrderItems`);
    });

    test("Depth 2: Deliveries (composition of OrderItems) has blocking field", () => {
      expectBlocking(`${DB}.Deliveries`);
    });

    test("Payments (composition of Orders) has blocking field", () => {
      expectBlocking(`${DB}.Payments`);
    });
  });

  // --- Simple projections on composition targets ---

  describe("Simple projections on composition targets", () => {
    test("OrderItemsView has blocking field", () => {
      expectBlocking(`${NS}.OrderItemsView`);
    });

    test("DeliveriesView has blocking field", () => {
      expectBlocking(`${NS}.DeliveriesView`);
    });
  });

  // --- Multi-level projections (projection -> projection -> table) ---

  describe("Multi-level projections on composition targets", () => {
    test("OrderItemsL2 (2 levels from base) has blocking field", () => {
      expectBlocking(`${NS}.OrderItemsL2`);
    });

    test("OrderItemsL3 (3 levels from base) has blocking field", () => {
      expectBlocking(`${NS}.OrderItemsL3`);
    });
  });

  // --- Projection chain on ILM Object root ---

  describe("Projection chain on ILM Object root", () => {
    test("Orders (root ILM object) has blocking field", () => {
      expectBlocking(`${DB}.Orders`);
    });

    test("OrdersView (projection on Orders) has blocking field", () => {
      expectBlocking(`${NS}.OrdersView`);
    });

    test("OrdersL2 (projection -> projection -> Orders) has blocking field", () => {
      expectBlocking(`${NS}.OrdersL2`);
    });

    test("OrdersL3 (3 levels deep) has blocking field", () => {
      expectBlocking(`${NS}.OrdersL3`);
    });
  });

  // --- Join views ---

  describe("Join views", () => {
    test("OrdersWithItems (left outer join) has blocking field", () => {
      expectBlocking(`${NS}.OrdersWithItems`);
    });

    test("OrdersInnerJoin (inner join) has blocking field", () => {
      expectBlocking(`${NS}.OrdersInnerJoin`);
    });
  });

  // --- Union views ---

  describe("Union views", () => {
    test("OrderItemsUnion has blocking field", () => {
      expectBlocking(`${NS}.OrderItemsUnion`);
    });
  });

  // --- Union with join in hierarchy ---

  describe("Union with join in hierarchy", () => {
    test("OrdersJoinUnion has blocking field", () => {
      expectBlocking(`${NS}.OrdersJoinUnion`);
    });
  });

  // --- Projection on join view ---

  describe("Projection on join view", () => {
    test("ProjectedJoinView has blocking field", () => {
      expectBlocking(`${NS}.ProjectedJoinView`);
    });
  });

  // --- Projection on union view ---

  describe("Projection on union view", () => {
    test("ProjectedUnionView has blocking field", () => {
      expectBlocking(`${NS}.ProjectedUnionView`);
    });
  });

  // --- Union on union (union -> union -> table) ---

  describe("Union on union", () => {
    test("OrderItemsUnionL2 (union selecting from union) has blocking field", () => {
      expectBlocking(`${NS}.OrderItemsUnionL2`);
    });
  });
});
