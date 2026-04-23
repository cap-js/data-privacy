using {
  sap.capire.bookshop.Orders,
  sap.capire.bookshop.OrderItems,
  sap.capire.bookshop.Customers,
  sap.capire.bookshop.Marketing
} from './schema';


entity OrdersWithItems         as
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


entity OrdersWithManyItemJoins as
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


entity OrdersInnerJoin         as
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
entity OrdersWithMarketing     as
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
