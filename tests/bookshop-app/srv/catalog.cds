using {sap.capire.bookshop as db} from '../db/schema';

@requires: 'authenticated-user'
@Auditing.DefaultAuditorScopes: ['CATALOG_AUDITOR']
service CatalogService {

  entity Customers             as projection on db.Customers;
  entity CustomerPostalAddress as projection on db.CustomerPostalAddress;

  @UI.LineItem: [
    {Value: ID, },
    {Value: OrderNo, },
  ]
  entity Orders                as
    select from db.Orders {
      *,
      legalEntity.title as legalEntity_title
    }
    excluding {
      legalEntity
    };

  entity OrderItems            as
    select from db.OrderItems
    mixin {
      backlink   : Association to one Orders
                     on parent_ID = backlink.ID;
      deliveries : Composition of many Deliveries
                     on deliveries.parent = $self
    }
    into {
      *,
      backlink,
      backlink.OrderNo  as backlink_OrderNo,
      backlink.Customer as backlink_Customer,
      deliveries,
      book.ID           as book_ID
    }
    excluding {
      deliveries,
      book
    };

  entity Deliveries            as
    select from db.Deliveries
    mixin {
      parent : Association to one OrderItems
                 on parent.ID = $self.parent_ID
    }
    into {
      *,
      parent,
      parent.backlink_Customer as parent_backlink_Customer,
      parent.ID                as parent_ID
    }
    excluding {
      parent
    };

  entity Configuration         as projection on db.Configuration;

};
