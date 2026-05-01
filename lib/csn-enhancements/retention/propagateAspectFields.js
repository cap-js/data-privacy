const {
  _getBlockingDateField,
  _getEndOfRetentionField,
  _getSourceEntity,
  _getQueryFrom,
  ensureAspectField
} = require("../../utils");

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
 * Excludes join views — those need all sources enhanced first and are handled by
 * propagateAspectFieldsToJoinViews to correctly produce CASE expressions when
 * multiple join sources have blocking fields.
 * Cached per model object for reuse across multiple calls.
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

module.exports = {
  propagateAspectFieldsToJoinViews,
  propagateAspectToProjections,
  getProjectionsBySource
};
