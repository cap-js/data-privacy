using {DPIRetentionService} from '@sap/cds-dpi';
using {sap.capire.bookshop as db} from '../db/schema';

extend service DPIRetentionService with {
    entity Orders as projection on db.Orders {
        ID,
        legalEntity,
        endOfWarrantyDate as aliasEndOfBusiness,
        Customer,
        Items
    }
}