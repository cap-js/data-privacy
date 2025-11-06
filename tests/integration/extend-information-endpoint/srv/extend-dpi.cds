using {DPIInformationService} from '@sap/cds-dpi';
using {sap.capire.bookshop as db} from '../db/schema';

extend service DPIInformationService with {
    entity Orders as projection on db.Orders {
        ID,
        legalEntity,
        endOfWarrantyDate as aliasEndOfBusiness,
        Customer,
        Items
    }

    @PersonalData : { 
        DataSubjectRole : 'Customer',
        EntitySemantics : 'Other',
     }
    entity OrderItems as projection on db.OrderItems as oi {
        *,
        (SELECT Customer.ID FROM Orders WHERE Orders.ID = oi.parent_ID) as dataSubjectID @(PersonalData.FieldSemantics : 'DataSubjectID')
    }
}