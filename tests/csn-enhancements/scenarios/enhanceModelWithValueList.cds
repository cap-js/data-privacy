using {sap.ilm.bookshop.Orders} from './base';
using from './base';
using from './base';

using from '@sap/cds/common';


annotate Orders with {
  OrderNo @ILM.FieldSemantics: 'ProcessOrganizationID'
}

extend Orders with {
  order_property_1 : String;

}

annotate Orders with
@Common.Label: 'Orders' // ILMObjectName
@Core.Description: 'Description of Orders' //ILMObjectDescription


@ILM.BlockingEnabled: true // Mark as blocking relevant,
@ILM.ArchivingEnabled: true // Mark as archiving relevant
@Capabilities.FilterRestrictions.Filterable: true // Add all columns as selection criteria
@Capabilities.FilterRestrictions.FilterExpressionRestrictions: [
  { // configure specific restrictions for columns
    property: OrderNo,
    allowedexpressions: 'SingleRange'
  },
  {
    property: order_property_1,
    allowedexpressions: 'SingleRange'
  }
]
@Capabilities.FilterRestrictions.RequiredProperties: ['endOfWarrantyDate'] // Make endOfWarrantyDate mandatory for filtering

@PersonalData: {
  DataSubjectRole: 'Customer',
  EntitySemantics: 'Other'
}

{
  // Fixed annotations
  Customer @PersonalData.FieldSemantics: 'DataSubjectID';
  endOfWarrantyDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
  legalEntity @PersonalData.FieldSemantics: 'DataControllerID';


  // Example Annoations for selection criteria
  OrderNo
  @Common.Label: 'Order Number'
  @Core.Description: 'Unique identifier for the order';
  createdAt
  @Common.Label: 'Creation Date'
  @Core.Description: 'Date when the order was created';
  modifiedAt
  @Common.Label: 'Last Modified'
  @Core.Description: 'Date when the order was last modified';
  // Example Annotation for conditions
  currency
  @Common.Label: 'Currency'
  @Core.Description: 'Currency used for the order'
  @ILM.FieldSemantics: 'ProcessOrganizationID'
  @Common.ValueList: {
    CollectionPath: 'Currencies',
    Parameters: [
      {
        $Type: 'Common.ValueListParameterInOut',
        LocalDataProperty: 'currency',
        ValueListProperty: 'code'
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'symbol'
      }
    ]
  };

  legalEntity @ILM.FieldSemantics: 'LineOrganizationID'
  @Common.ValueList: {
    CollectionPath: 'LegalEntities',
    Parameters: [
      {
        $Type: 'Common.ValueListParameterInOut',
        LocalDataProperty: 'legalEntity_title',
        ValueListProperty: 'title'
      },
      {
        $Type: 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'description'
      }
    ]
  };

  order_property_1 @Common.Label: 'Order Property 1'
  @Core.Description: 'Unique identifier for property 1';


}


annotate Orders with @UI.SelectionField: [

  {
    Value: order_property_1,
    Label: 'Order Property 1'
  },
  {
    Value: OrderNo,
    Label: 'Order Number'
  }
];
