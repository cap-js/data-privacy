using sap.ilm.bookshop as bookshop from './base';

extend sap.ilm.bookshop.OrderItems with {
  customer : Association to one bookshop.Customers;
}
