using {sap.capire.bookshop as my} from '../db/schema';

service CatalogService {
  @requires: 'authenticated-user' action submitOrder(book: UUID, quantity: Integer) returns {
    stock : Integer
  };
}
