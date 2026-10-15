// Annotates ILM Objects from base.cds to test @ILM.IsRetentionManaged feature flag behavior.
// When dataSubjectReuseAnnotations is enabled, only entities that opt in via
// @ILM.IsRetentionManaged receive plugin-managed blocking/destruction fields.
using {
  sap.ilm.bookshop.Orders,
  sap.ilm.bookshop.Marketing
} from './base';

// Orders opts in to plugin-managed blocking/destruction field injection
annotate Orders with @ILM.IsRetentionManaged: true;

// Marketing is intentionally left without @ILM.IsRetentionManaged to verify that
// entities without the annotation are skipped when the feature flag is enabled
