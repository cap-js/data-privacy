using {sap.ilm.RetentionService} from '@cap-js/data-privacy';
using {sap.capire.bookshop as db} from '../db/schema';

extend service RetentionService with {
  entity ILMObjectWithXPRBlockingEnabled as
    projection on db.ILMObjectWithXPRBlockingEnabled {
      *,
      division.legalEntity @(ILM.FieldSemantics: 'LineOrganizationID'),
      division.purpose_ID @(ILM.FieldSemantics: 'ProcessOrganizationID'),
    };

  @cds.redirection.target
  entity LegalEntities                   as
    projection on db.LegalEntities
    excluding {
      divisions
    };
}
