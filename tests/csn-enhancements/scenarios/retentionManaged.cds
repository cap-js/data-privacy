// Annotates ILM Objects from base.cds to test @ILM.IsRetentionManaged opt-out behavior.
// When dataSubjectReuseAnnotations is enabled, ILM Objects get blocking fields by default.
// An entity can opt out by setting @ILM.IsRetentionManaged: false.
using {
  sap.ilm.bookshop.Orders,
  sap.ilm.bookshop.Marketing
} from './base';

// Orders does not need @ILM.IsRetentionManaged — it gets fields by default.
// Annotating it true is a no-op (kept here to verify true does not suppress fields).
annotate Orders with @ILM.IsRetentionManaged: true;

// Marketing explicitly opts out of plugin-managed blocking/destruction field injection.
annotate Marketing with @ILM.IsRetentionManaged: false;
