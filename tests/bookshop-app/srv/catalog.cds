using {sap.capire.bookshop as db} from '../db/schema';

@requires: 'authenticated-user'
service CatalogService {

  entity Customers             as projection on db.Customers;
  entity CustomerPostalAddress as projection on db.CustomerPostalAddress;

  @UI.LineItem : [
    {
        Value : ID,
    },
    {
        Value : OrderNo,
    },
  ]
  entity Orders         as projection on db.Orders;

};
