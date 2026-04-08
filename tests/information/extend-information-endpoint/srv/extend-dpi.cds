using {sap.dpp.InformationService} from '@cap-js/data-privacy';
using {sap.capire.bookshop as db} from '../db/schema';

extend service InformationService with {
  entity Orders     as
    projection on db.Orders {
      ID,
      legalEntity,
      endOfWarrantyDate as aliasEndOfBusiness,
      Customer,
      Items
    }

  @PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'Other',
  }
  entity OrderItems as
    projection on db.OrderItems
    as oi {
      *,
      (
        select Customer.ID from Orders
        where
          Orders.ID = oi.parent_ID
      ) as dataSubjectID @(PersonalData.FieldSemantics: 'DataSubjectID')
    }
}
