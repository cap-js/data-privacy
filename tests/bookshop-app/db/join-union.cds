using {
  sap.capire.bookshop.Orders,
  sap.capire.bookshop.OrderItems,
  sap.capire.bookshop.Customers,
  sap.capire.bookshop.Marketing,
  sap.capire.bookshop.Books,
  sap.capire.bookshop.Authors
} from './schema';


entity OrdersWithItems               as
  select from Orders as o
  left outer join OrderItems as i
    on i.parent_ID = o.ID
  {
    o.ID,
    o.endOfWarrantyDate,
    o.legalEntity,
    o.OrderNo,
    i.amount,
    i.netAmount
  };


entity OrdersWithManyItemJoins       as
  select from Orders as o
  left outer join OrderItems as i
    on  i.parent_ID = o.ID
    and i.amount    = 15
  left outer join OrderItems as i2
    on  i.parent_ID = o.ID
    and i.amount    = 28
  left outer join OrderItems as i3
    on  i.parent_ID = o.ID
    and i.amount    = 11.11
  {
    o.ID,
    o.endOfWarrantyDate,
    o.legalEntity,
    o.OrderNo,
    i.amount,
    i.netAmount,
    i2.amount    as i2Amount,
    i2.netAmount as i2netAmount,
    i3.amount    as i3Amount,
    i3.netAmount as i3netAmount,
  };


entity OrdersInnerJoin               as
  select from Orders as o
  inner join OrderItems as i
    on i.parent_ID = o.ID
  {
    o.ID,
    o.endOfWarrantyDate,
    o.legalEntity,
    o.OrderNo,
    i.amount,
    i.netAmount
  };


view CustomersUnion as
    select from Customers
    where
      legalEntity.title = 'SAP Ltd'
  union
    select from Customers
    where
      legalEntity.title = 'SAP LGD'
  union
    select from Customers
    where
      legalEntity.title = 'SAP SE'
  union
    select from Customers
    where
      legalEntity.title = 'SAP US';


view OrdersJoinUnion as
    select from Orders as o
    left outer join OrderItems as i
      on i.parent_ID = o.ID
    {
      o.ID,
      o.endOfWarrantyDate,
      o.legalEntity,
      o.OrderNo,
      i.amount
    }
    where
      o.OrderNo like 'A%'
  union
    select from Orders as o
    inner join OrderItems as i
      on i.parent_ID = o.ID
    {
      o.ID,
      o.endOfWarrantyDate,
      o.legalEntity,
      o.OrderNo,
      i.amount
    }
    where
      o.OrderNo like 'B%';


// Join of two ILM entities — both have blocking dates.
// min() must collect from ALL joined entities.
entity OrdersWithMarketing           as
  select from Orders as o
  left outer join Marketing as m
    on m.Customer = o.Customer
  {
    o.ID,
    o.endOfWarrantyDate,
    o.legalEntity,
    o.OrderNo,
    m.text as marketingText,
    m.marketingDate
  };

// --- Multi-level projection (projection -> projection -> composition target) ---
entity OrderItemsL2                  as projection on OrderItems;
entity OrderItemsL3                  as projection on OrderItemsL2;

// --- Union view on composition target ---
entity OrderItemsUnion               as
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

// --- Union on union (union -> union -> table) ---
entity OrderItemsUnionL2             as
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

// --- Right-hand-only blocking in joins ---
// Books/Authors have NO ILM/blocking annotations.
// Orders/OrderItems DO have blocking (via ILM enhancement).
// These test that blocking propagates when only the non-primary (right) side has the field.

entity BooksWithOrdersRightBlocking  as
  select from Books as b
  left outer join Orders as o
    on o.ID = b.ID
  {
    b.ID,
    b.title,
    o.OrderNo,
    o.endOfWarrantyDate
  };

entity AuthorsWithItemsRightBlocking as
  select from Authors as a
  inner join OrderItems as i
    on i.ID = a.ID
  {
    a.ID,
    a.name,
    i.amount
  };

// Three-way join: Left = Books (no blocking), Middle = Orders (blocking), Right = Authors (no blocking)
entity MiddleJoinBlocking            as
  select from Books as b
  left outer join Orders as o
    on o.ID = b.ID
  left outer join Authors as a
    on a.ID = b.ID
  {
    b.ID,
    b.title,
    o.OrderNo,
    a.name
  };

// Projection on right-side-blocking join view
entity ProjectedRightBlockingJoin    as projection on BooksWithOrdersRightBlocking;
