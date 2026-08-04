using {sap.capire.bookshop as db} from '../db/schema';

@requires: 'authenticated-user'
service AdminService {

  @odata.draft.enabled
  entity Orders as projection on db.Orders;
};
