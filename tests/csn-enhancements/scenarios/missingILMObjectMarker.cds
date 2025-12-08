
using sap.dpp.bookshop as bookshop from './base';

extend sap.dpp.bookshop.OrderItems with {
    customer : Association to one bookshop.Customers;
}
