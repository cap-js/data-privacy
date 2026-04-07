using {sap.capire.bookshop as db} from '../db/schema';

@requires: 'authenticated-user'
service CatalogService {

  entity Customers as projection on db.Customers;

  @UI.LineItem: [
    {Value: ID, },
    {Value: OrderNo, },
  ]
  entity Orders    as projection on db.Orders;

};
