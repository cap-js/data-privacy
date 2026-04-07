using {sap.ilm.RetentionService} from '@sap/cds-dpi';
using {sap.capire.bookshop as db} from '../db/schema';

extend service RetentionService with {
  entity Orders        as
    projection on db.Orders {
      ID,
      legalEntity,
      endOfWarrantyDate as aliasEndOfBusiness,
      Customer,
      Items
    }

  entity LegalEntities as projection on db.LegalEntities;
}
