const cds = require("@sap/cds");
const LOG = cds._dpi.log("data-privacy");
const {
  _getBlockingDateField,
  _getEndOfRetentionField,
  _getOrgAttributeIDField,
  _getDataSubjectIDField,
  _getEndOfBusinessDateField,
  _getSourceEntity,
  _getQueryFrom,
  ensureAspectField
} = require("../../utils");
const { exposeCompositionsWithRewrites } = require("../shared/compositionsRewrite");
const {
  redirectAssociationsToServiceIfPossible,
  defineILMRootColumns
} = require("../shared/entityExposure");
const enhanceModelWithValueLists = require("./enhanceModelWithValueLists");

/**
 * Add blocking and destruction aspects to a base entity (no query/projection).
 */
function addBlockingAspectToBaseEntity(entity, m) {
  if (!_getBlockingDateField(entity.elements) && !_getEndOfRetentionField(entity.elements)) {
    Object.assign(entity.elements, m.definitions["sap.ilm.blocking"].elements);
    Object.assign(entity.elements, m.definitions["sap.ilm.destruction"].elements);
    entity.includes ??= [];
    entity.includes.push("sap.ilm.blocking", "sap.ilm.destruction");
  } else if (!_getBlockingDateField(entity.elements)) {
    entity.elements[_getBlockingDateField(m.definitions["sap.ilm.blocking"].elements)] =
      m.definitions["sap.ilm.blocking"].elements[
        _getBlockingDateField(m.definitions["sap.ilm.blocking"].elements)
      ];
  } else if (!_getEndOfRetentionField(entity.elements)) {
    entity.elements[_getEndOfRetentionField(m.definitions["sap.ilm.destruction"].elements)] =
      m.definitions["sap.ilm.destruction"].elements[
        _getEndOfRetentionField(m.definitions["sap.ilm.destruction"].elements)
      ];
  }
}

module.exports = { exposeRetentionEntity, propagateAspectFieldsToJoinViews };

function exposeRetentionEntity(name, def, exposedEntities, m) {
  const entityName = name.split(".")[name.split(".").length - 1];
  const projectionsBySource = getProjectionsBySource(m);

  //Add DPP Flag aspect to entity
  if (!def.query && !def.projection) {
    addBlockingAspectToBaseEntity(def, m);
    addBlockingAspectToCompositions(def.elements, m, projectionsBySource);
    propagateAspectToProjections(
      name,
      _getBlockingDateField,
      "sap.ilm.blocking",
      m,
      projectionsBySource
    );
    propagateAspectToProjections(
      name,
      _getEndOfRetentionField,
      "sap.ilm.destruction",
      m,
      projectionsBySource
    );
  } else {
    // Walk down projection hierarchy to base entity, add blocking aspect there,
    // then propagate fields into all projections based on the root
    let current = def;
    let currentName = name;
    let depth = 0;
    while (current.query || current.projection) {
      if (++depth > (cds.env.requires["sap.ilm.RetentionService"]?.maxProjectionDepth ?? 20)) {
        LOG.error(
          `Exceeded maximum projection depth while adding blocking aspect for ${name}. Possible circular projection. Increase via cds.requires["sap.ilm.RetentionService"].maxProjectionDepth.`
        );
        break;
      }
      const sourceName = _getSourceEntity(_getQueryFrom(current));
      if (!sourceName) break;
      current = m.definitions[sourceName];
      currentName = sourceName;
      if (!current) break;
    }
    if (current && !current.query && !current.projection) {
      addBlockingAspectToBaseEntity(current, m);
      addBlockingAspectToCompositions(current.elements, m, projectionsBySource);
      // Propagate blocking/destruction to all projections of the base entity (recursively)
      propagateAspectToProjections(
        currentName,
        _getBlockingDateField,
        "sap.ilm.blocking",
        m,
        projectionsBySource
      );
      propagateAspectToProjections(
        currentName,
        _getEndOfRetentionField,
        "sap.ilm.destruction",
        m,
        projectionsBySource
      );
    }
  }

  //Add DataSubjectID, DataControllerID and EndOfBusinessDate fields from parent - from root view also have a look at comps to one and resolve if those contain the fields
  const fields = {
    legalID: _getOrgAttributeIDField(def.elements) || _getOrgAttributeIDField,
    dsID: _getDataSubjectIDField(def.elements) || _getDataSubjectIDField,
    eob: _getEndOfBusinessDateField(def.elements) || _getEndOfBusinessDateField
  };
  const entityAlreadyExposed = !!m.definitions["sap.ilm.RetentionService" + "." + entityName];
  const retentionEntity =
    m.definitions["sap.ilm.RetentionService" + "." + entityName] ?? structuredClone(def);
  retentionEntity["@cds.api.ignore"] = true;
  retentionEntity["@requires"] = "InvalidRoleSoEntitiesCannotBeAccessedViaAPI";

  if (entityAlreadyExposed) {
    // If the entity is already exposed make sure the blocking and destruction properties
    // are exposed as well - else DPI is not working
    ensureAspectField(retentionEntity, _getBlockingDateField, "sap.ilm.blocking", m);
    ensureAspectField(retentionEntity, _getEndOfRetentionField, "sap.ilm.destruction", m);
  } else {
    if (retentionEntity.includes) delete retentionEntity.includes;
    delete retentionEntity.projection;
    retentionEntity.query = {
      SELECT: {
        from: { ref: [name] },
        columns: defineILMRootColumns(retentionEntity, fields, m)
      }
    };
    m.definitions["sap.ilm.RetentionService" + "." + entityName] = retentionEntity;
  }
  exposedEntities[name] = "sap.ilm.RetentionService" + "." + entityName;
  //For retention compositions can be added without modifying columns
  const composedEntities = exposeCompositionsWithRewrites(name, retentionEntity, m, {
    dsFields: {},
    redirectForParent: undefined,
    entities: exposedEntities,
    dppServiceName: "sap.ilm.RetentionService",
    assignInformationAnnotations: false,
    rmCompsToTransactionalRecords: true
  });
  Object.assign(m.definitions, composedEntities);

  // DataSubjects do not have OrgAttributes / SelectionCriteria / Conditions
  if (retentionEntity["@PersonalData.EntitySemantics"] === "Other") {
    redirectAssociationsToServiceIfPossible(retentionEntity, "sap.ilm.RetentionService", m);
    enhanceModelWithValueLists("sap.ilm.RetentionService" + "." + entityName, retentionEntity, m);
  }
}

/**
 * Propagate blocking/destruction fields to join/union views.
 * Must be called AFTER all base entities and compositions are fully enhanced,
 * so that all join sources have their blocking fields and CASE expressions
 * can be built correctly for multi-source joins.
 * @param {object} m - The CSN model
 * @param {string[]} dpiServiceNames - Service prefixes to skip (e.g. DPI service entities)
 */
function propagateAspectFieldsToJoinViews(m, dpiServiceNames) {
  for (const name in m.definitions) {
    const entity = m.definitions[name];
    if (entity.kind !== "entity") continue;
    if (!entity.query?.SELECT?.from?.join && !entity.query?.SET) continue;
    if (dpiServiceNames.some((srv) => name.startsWith(srv))) continue;
    // Only propagate if the source entity actually has the field
    const sourceName = _getSourceEntity(_getQueryFrom(entity));
    const sourceEntity = sourceName && m.definitions[sourceName];
    if (sourceEntity && _getBlockingDateField(sourceEntity.elements)) {
      ensureAspectField(entity, _getBlockingDateField, "sap.ilm.blocking", m);
    }
    if (sourceEntity && _getEndOfRetentionField(sourceEntity.elements)) {
      ensureAspectField(entity, _getEndOfRetentionField, "sap.ilm.destruction", m);
    }
  }
  // Also propagate to projections on top of join/union views
  const projectionsBySource = getProjectionsBySource(m);
  for (const name in m.definitions) {
    const entity = m.definitions[name];
    if (entity.kind !== "entity") continue;
    if (!entity.query?.SELECT?.from?.join && !entity.query?.SET) continue;
    if (_getBlockingDateField(entity.elements)) {
      propagateAspectToProjections(
        name,
        _getBlockingDateField,
        "sap.ilm.blocking",
        m,
        projectionsBySource
      );
    }
    if (_getEndOfRetentionField(entity.elements)) {
      propagateAspectToProjections(
        name,
        _getEndOfRetentionField,
        "sap.ilm.destruction",
        m,
        projectionsBySource
      );
    }
  }
}

function addBlockingAspectToCompositions(elements, m, projectionsBySource) {
  for (const ele in elements) {
    if (elements[ele].type === "cds.Composition") {
      const targetName = elements[ele].target;
      const def = m.definitions[targetName];
      def.includes ??= [];
      def.includes.push("sap.ilm.blocking");
      Object.assign(def.elements, m.definitions["sap.ilm.blocking"].elements);

      // Propagate blocking field to all views/projections selecting from this composition target
      propagateAspectToProjections(
        targetName,
        _getBlockingDateField,
        "sap.ilm.blocking",
        m,
        projectionsBySource
      );

      addBlockingAspectToCompositions(def.elements, m, projectionsBySource);
    }
  }
}

/**
 * Recursively propagate an aspect field to all projections of a given entity
 * and their transitive projections (projection-of-projection).
 */
function propagateAspectToProjections(entityName, fieldGetter, aspectName, m, projectionsBySource) {
  const projections = projectionsBySource.get(entityName);
  if (!projections) return;
  for (const { name, entity } of projections) {
    if (fieldGetter(entity.elements)) continue; // already has it
    ensureAspectField(entity, fieldGetter, aspectName, m);
    propagateAspectToProjections(name, fieldGetter, aspectName, m, projectionsBySource);
  }
}

/**
 * Build a map from source entity name to all view entities (with their names) projecting from it.
 * Excludes join views — those need all sources enhanced first and are handled in index.js
 * to correctly produce CASE expressions when multiple join sources have blocking fields.
 * Cached per model object for reuse across multiple exposeRetentionEntity calls.
 */
const _projectionsBySourceCache = new WeakMap();
function getProjectionsBySource(m) {
  if (_projectionsBySourceCache.has(m)) return _projectionsBySourceCache.get(m);
  const map = new Map();
  for (const name in m.definitions) {
    const entity = m.definitions[name];
    if (entity.kind !== "entity") continue;
    const from = _getQueryFrom(entity);
    if (!from || from.join) continue;
    const source = _getSourceEntity(from);
    if (source) {
      if (!map.has(source)) map.set(source, []);
      map.get(source).push({ name, entity });
    }
  }
  _projectionsBySourceCache.set(m, map);
  return map;
}
