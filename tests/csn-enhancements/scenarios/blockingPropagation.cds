// Test scenarios for blocking field propagation.
// Built on top of base.cds which provides ILM Objects and compositions.
using {
  sap.ilm.bookshop.Orders,
  sap.ilm.bookshop.OrderItems,
  sap.ilm.bookshop.Deliveries,
  sap.ilm.bookshop.Payments
} from './base';

namespace test.blockingPropagation;

// --- Simple projections on composition targets ---

entity OrderItemsView     as projection on OrderItems;
entity DeliveriesView     as projection on Deliveries;

// --- Multi-level projections (projection -> projection -> table) ---

entity OrderItemsL2       as projection on OrderItemsView;
entity OrderItemsL3       as projection on OrderItemsL2;

// --- Projection -> Projection -> ILM Object -> table ---

entity OrdersView         as projection on Orders;
entity OrdersL2           as projection on OrdersView;
entity OrdersL3           as projection on OrdersL2;

// --- Join views ---

entity OrdersWithItems    as
  select from Orders as o
  left outer join OrderItems as i
    on i.parent_ID = o.ID
  {
    o.ID,
    o.OrderNo,
    o.endOfWarrantyDate,
    o.legalEntity,
    i.amount
  };

entity OrdersInnerJoin    as
  select from Orders as o
  inner join OrderItems as i
    on i.parent_ID = o.ID
  {
    o.ID,
    o.OrderNo,
    o.endOfWarrantyDate,
    o.legalEntity,
    i.amount
  };

// --- Union views ---

entity OrderItemsUnion    as
    select from OrderItems {
      ID,
      parent_ID,
      amount
    }
    where
      amount > 10
  union all
    select from OrderItems {
      ID,
      parent_ID,
      amount
    }
    where
      amount <= 10;

// --- Union with join in hierarchy ---

entity OrdersJoinUnion    as
    select from Orders as o
    left outer join OrderItems as i
      on i.parent_ID = o.ID
    {
      o.ID,
      o.OrderNo,
      o.endOfWarrantyDate,
      o.legalEntity,
      i.amount
    }
  union all
    select from Orders as o
    inner join OrderItems as i
      on i.parent_ID = o.ID
    {
      o.ID,
      o.OrderNo,
      o.endOfWarrantyDate,
      o.legalEntity,
      i.amount
    };

// --- Projection on join view ---

entity ProjectedJoinView  as projection on OrdersWithItems;

// --- Projection on union view ---

entity ProjectedUnionView as projection on OrderItemsUnion;

// --- Projection on union on union (union -> union -> table) ---

entity OrderItemsUnionL2  as
    select from OrderItemsUnion {
      ID,
      parent_ID,
      amount
    }
    where
      amount > 5
  union all
    select from OrderItemsUnion {
      ID,
      parent_ID,
      amount
    }
    where
      amount <= 5;
