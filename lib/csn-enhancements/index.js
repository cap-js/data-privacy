const cds = require("@sap/cds");
const path = require("path");
const fs = require("fs");
const LOG = cds._dpi.log("data-privacy");
const enhanceAnnotations = require("./shared/enhanceAnnotations");
const { entityValidation } = require("./shared/modelValidations");
const exposeInformationEntity = require("./information/exposeEntity");
const exposeRetentionEntity = require("./retention/exposeEntity");
const { propagateAspectFieldsToJoinViews } = require("./retention/propagateAspectFields");
const {
  getLowestILMObjectInProjectionHierarchy,
  exposeAutoExposedEntities,
  fixRelationTarget
} = require("./shared/entityExposure");

const RETENTION_SERVICE = "sap.ilm.RetentionService";
const INFORMATION_SERVICE = "sap.dpp.InformationService";

// Aspects defined in the plugin's own db/dpi.cds that the retention exposure relies on.
const ILM_ASPECTS = ["sap.ilm.blocking", "sap.ilm.destruction"];

/**
 * Ensure the plugin's own sap.ilm.blocking / sap.ilm.destruction aspects are present in the CSN
 * before the per-entity exposure runs.
 *
 * These aspects live in this package's db/dpi.cds and normally reach the CSN because the DPI
 * service files `using` them. During an isolated `cds build --production` db-task compilation,
 * however, only the application's own db model is compiled — the service files are not part of
 * that CSN — so the aspects are missing and retention exposure would crash (issue #41, Crash A).
 *
 * This loads db/dpi.cds from this package and merges ONLY the two aspect definitions into the
 * CSN. It never imports a service artifact (e.g. sap.ilm.RetentionService) into a db-task CSN.
 * Idempotent and runs at most once per call; failures are swallowed so the defensive guard in
 * exposeEntity.js can log a clear warning and skip injection.
 *
 * @param {CSN} csn
 */
function ensureILMAspects(csn) {
  if (ILM_ASPECTS.every((a) => csn.definitions[a])) {
    return; // all aspects already present (normal runtime / all-tasks load)
  }
  try {
    // db/dpi.cds sits two levels up from this file (lib/csn-enhancements/index.js).
    const dpiPath = path.resolve(__dirname, "..", "..", "db", "dpi.cds");
    // db/dpi.cds has no `using from`, so compiling its source in isolation is self-contained
    // and does not pull in any service. cds.compile(<string>) is synchronous, which matches the
    // synchronous cds.on("loaded") hook that drives enhanceModel.
    const compiled = cds.compile(fs.readFileSync(dpiPath, "utf8"));
    for (const aspect of ILM_ASPECTS) {
      if (!csn.definitions[aspect] && compiled.definitions[aspect]) {
        csn.definitions[aspect] = compiled.definitions[aspect];
      }
    }
  } catch (e) {
    // Non-fatal: the defensive guard in addBlockingAspectToBaseEntity will warn and skip.
    LOG.debug(`Could not load sap.ilm aspects from db/dpi.cds: ${e.message}`);
  }
}

/**
 * Generates the DPI Information and Retention services
 * @param {CSN} m
 * @returns
 */
module.exports = function enhanceModel(m) {
  const _enhanced = "sap.ilm.enhanced";
  if (m.meta?.[_enhanced] || m.definitions[INFORMATION_SERVICE]?.["@sap.ilm.model.enhanced"]) {
    return; // already enhanced
  }

  const inferredCSN =
    m.meta.flavor === "xtended"
      ? cds.compile({
          "csn.csn": JSON.stringify(m)
        })
      : m;

  enhanceAnnotations(m, inferredCSN);

  // Ensure the plugin's own sap.ilm.* aspects are available before per-entity exposure.
  // In an isolated db-task build they are not in the CSN (see ensureILMAspects / issue #41).
  ensureILMAspects(inferredCSN);

  const DPI_SERVICES = { [RETENTION_SERVICE]: {}, [INFORMATION_SERVICE]: {} };

  for (const DPI_SRV in DPI_SERVICES) {
    LOG.debug(`Existing ${DPI_SRV}: `, inferredCSN.definitions[DPI_SRV]);
  }
  for (const artefactName in inferredCSN.definitions) {
    if (inferredCSN.definitions[artefactName].kind !== "entity") {
      continue;
    }

    const baseILMEntityName = getLowestILMObjectInProjectionHierarchy(artefactName, inferredCSN);
    const baseILMEntity = inferredCSN.definitions[baseILMEntityName];
    const isAlreadyExposed = Object.keys(DPI_SERVICES).some(
      (DPI_SRV) => baseILMEntityName in DPI_SERVICES[DPI_SRV] || artefactName.startsWith(DPI_SRV)
    );

    // Validation at the start to also cover incomplete entities
    entityValidation(artefactName, inferredCSN, DPI_SERVICES);

    const alreadyExposed = Object.keys(DPI_SERVICES).some(
      (DPI_SRV) =>
        baseILMEntityName in DPI_SERVICES[DPI_SRV] || baseILMEntityName.startsWith(DPI_SRV)
    );
    const dppRelevant = !!baseILMEntity["@PersonalData.EntitySemantics"];
    const isCompositionTargetOfDataSubject =
      baseILMEntity["@PersonalData.EntitySemantics"] === "DataSubjectDetails" &&
      Object.values(baseILMEntity.elements).some(
        (e) =>
          e.target &&
          inferredCSN.definitions[e.target]["@PersonalData.EntitySemantics"] === "DataSubject" &&
          Object.values(inferredCSN.definitions[e.target].elements).some(
            (ee) => ee.target && ee.target === artefactName && ee.type === "cds.Composition"
          )
      );

    if (
      // REVISIT: Once archiving is supported this needs to check against ILM namespace as well
      !dppRelevant ||
      alreadyExposed ||
      // Skip data subject details entity if it is a composition of data subject as the data subject itself will include it
      isCompositionTargetOfDataSubject
    ) {
      continue;
    }

    // REVISIT: Likely this skip should not be necessary, if for joins and unions the correct base ILM entity is determined
    // Skip join/union views for DPI entity exposure — only the base entity should be exposed
    const entity = inferredCSN.definitions[artefactName];
    if (entity.query?.SELECT?.from?.join || entity.query?.SET) {
      LOG.debug(
        `Skipping exposure of ${artefactName} in sap.ilm.RetentionService and sap.dpp.InformationService because it is a join or union.`
      );
      continue;
    }

    exposeInformationEntity(
      isAlreadyExposed ? baseILMEntityName : artefactName,
      baseILMEntity,
      DPI_SERVICES[INFORMATION_SERVICE],
      inferredCSN
    );
    exposeRetentionEntity(
      isAlreadyExposed ? baseILMEntityName : artefactName,
      baseILMEntity,
      DPI_SERVICES[RETENTION_SERVICE],
      inferredCSN
    );
  }

  // After all base entities and compositions are enhanced, propagate blocking/destruction
  // fields to join/union views (which may reference multiple ILM entities and need all
  // sources to have their fields before CASE expressions can be built correctly).
  propagateAspectFieldsToJoinViews(inferredCSN, Object.keys(DPI_SERVICES));

  // expose Auto exposed entities manually to avoid wrong service exposures
  for (let artefactName in inferredCSN.definitions) {
    let artefact = inferredCSN.definitions[artefactName];
    if (artefactName.startsWith(RETENTION_SERVICE)) {
      exposeAutoExposedEntities(
        artefact,
        RETENTION_SERVICE,
        DPI_SERVICES[RETENTION_SERVICE],
        inferredCSN,
        {
          exposeEntities: false
        }
      );
    } else if (artefactName.startsWith(INFORMATION_SERVICE)) {
      exposeAutoExposedEntities(
        artefact,
        INFORMATION_SERVICE,
        DPI_SERVICES[INFORMATION_SERVICE],
        inferredCSN
      );
    }
  }

  // Because entities are manually added compositions and associations have to be cleaned up so targets match the service
  for (let artefactName in inferredCSN.definitions) {
    let artefact = inferredCSN.definitions[artefactName];
    for (const DPI_SRV in DPI_SERVICES) {
      if (artefactName.startsWith(DPI_SRV)) {
        fixRelationTarget(artefact, DPI_SERVICES[DPI_SRV], DPI_SRV, inferredCSN);
        break;
      }
    }
  }

  if (LOG._debug) {
    for (const DPI_SRV in DPI_SERVICES) {
      LOG.debug(
        `${DPI_SRV} model after modification by DPI plugin: `,
        Object.keys(inferredCSN.definitions)
          .filter((k) => k === DPI_SRV)
          .reduce((acc, key) => {
            acc[key] = inferredCSN.definitions[key];
            return acc;
          }, {})
      );
    }
  }

  // Copy all DPI service artifacts from inferredCSN to model
  for (const artefactName of Object.keys(inferredCSN.definitions)) {
    let artefact = inferredCSN.definitions[artefactName];
    if (Object.keys(DPI_SERVICES).some((dpi_srv) => artefactName.startsWith(dpi_srv))) {
      m.definitions[artefactName] = artefact;
    } else if (artefact.includes && m.definitions[artefactName]) {
      m.definitions[artefactName].includes = artefact.includes;
    } else if (artefact.query && m.definitions[artefactName]) {
      m.definitions[artefactName].query = artefact.query;
    } else if (artefact.projection && m.definitions[artefactName]) {
      m.definitions[artefactName].projection = artefact.projection;
    }
  }

  // REVISIT: Setting var on service is a workaround because CSN meta is not passed along compiles
  // If service is disabled this is not possible
  if (m.definitions[INFORMATION_SERVICE]) {
    m.definitions[INFORMATION_SERVICE]["@sap.ilm.model.enhanced"] = true;
  }
  if (m.definitions[INFORMATION_SERVICE]) {
    //REVISIT: CAP somehow writes csn.csn in MTX causing a crash. Thus manual override
    m.definitions[INFORMATION_SERVICE]["@source"] = "@cap-js/data-privacy/srv/DPIInformation.cds";
  }
  if (m.definitions[RETENTION_SERVICE]) {
    //REVISIT: CAP somehow writes csn.csn in MTX causing a crash. Thus manual override
    m.definitions[RETENTION_SERVICE]["@source"] = "@cap-js/data-privacy/srv/DPIRetention.cds";
  }

  m.meta ??= {};
  m.meta[_enhanced] = true;
  return m;
};
