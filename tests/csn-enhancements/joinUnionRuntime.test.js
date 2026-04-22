const cds = require("@sap/cds");
const path = require("path");

cds.test().in(path.join(__dirname, "../bookshop-app"));

describe("Runtime reads on join and union views", () => {
  test("Read on left outer join view (OrdersWithItems) does not crash", async () => {
    const { OrdersWithItems } = cds.entities;
    const result = await cds.run(SELECT.from(OrdersWithItems));
    expect(result).toBeDefined();
  });

  test("Read on multi-join view (OrdersWithManyItemJoins) does not crash", async () => {
    const { OrdersWithManyItemJoins } = cds.entities;
    const result = await cds.run(SELECT.from(OrdersWithManyItemJoins));
    expect(result).toBeDefined();
  });

  test("Read on inner join view (OrdersInnerJoin) does not crash", async () => {
    const { OrdersInnerJoin } = cds.entities;
    const result = await cds.run(SELECT.from(OrdersInnerJoin));
    expect(result).toBeDefined();
  });

  test("Read on union view (CustomersUnion) does not crash", async () => {
    const { CustomersUnion } = cds.entities;
    const result = await cds.run(SELECT.from(CustomersUnion));
    expect(result).toBeDefined();
  });

  test("Read on union of joins view (OrdersJoinUnion) does not crash", async () => {
    const { OrdersJoinUnion } = cds.entities;
    const result = await cds.run(SELECT.from(OrdersJoinUnion));
    expect(result).toBeDefined();
  });
});
