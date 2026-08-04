using {cuid, } from '@sap/cds/common';
using {sap.ilm.bookshop.Orders} from './base';

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'DataSubject',
}
entity DS : cuid {
  legalEntity         : String @PersonalData.FieldSemantics: 'DataControllerID';
  customer            : String @PersonalData.FieldSemantics: 'DataSubjectID';
  // Throws warning
  compToTransactional : Composition of many Orders
                          on compToTransactional.Customer.ID = ID;
  // Do not throw
  compDsDetails       : Composition of many DSDetails
                          on compDsDetails.ds = $self;
  unspecifiedComp     : Composition of many UnspecifiedComp
                          on unspecifiedComp.ds = $self;
  associatedOrders    : Association to many Orders
                          on associatedOrders.Customer.ID = ID;
}

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'DataSubjectDetails',
}
entity DSDetails : cuid {
  abc                     : String;
  ds                      : Association to one DS;
  // Throw warning
  compToOrdersInDSDetails : Composition of many Orders
                              on compToOrdersInDSDetails.Customer.ID = ID;
}

entity UnspecifiedComp : cuid {
  abc                : String;
  ds                 : Association to one DS;
  // Throw warning
  compToOrdersInComp : Composition of many Orders
                         on compToOrdersInComp.Customer.ID = ID;
}
