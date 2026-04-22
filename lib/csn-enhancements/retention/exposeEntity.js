const {
  _getBlockingDateField,
  _getEndOfRetentionField,
  _getOrgAttributeIDField,
  _getDataSubjectIDField,
  _getEndOfBusinessDateField,
  _getSourceEntity,
  _getQueryFrom
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

/**
 * Ensure a blocking or destruction field is present on an entity's elements and query columns.
 * @param {object} entity - CSN entity definition (may have query/projection)
 * @param {Function} fieldGetter - _getBlockingDateField or _getEndOfRetentionField
 * @param {string} aspectName - "sap.ilm.blocking" or "sap.ilm.destruction"
 * @param {object} m - CSN model
 */
function ensureFieldOnProjection(entity, fieldGetter, aspectName, m) {
  const aspectFieldName = fieldGetter(m.definitions[aspectName].elements);
  if (fieldGetter(entity.elements)) return;

  entity.elements[aspectFieldName] = m.definitions[aspectName].elements[aspectFieldName];

  const query = entity.query?.SELECT ?? entity.projection;
  if (query) {
    const sourceEntityName = _getSourceEntity(_getQueryFrom(entity));
    const queryTarget = sourceEntityName ? m.definitions[sourceEntityName] : undefined;
    query.columns ??= ["*"];
    if (
      queryTarget &&
      !query.columns.includes("*") &&
      !query.columns.some(
        (c) => (c.ref && c.ref[0] === fieldGetter(queryTarget.elements)) || c.as === aspectFieldName
      )
    ) {
      query.columns.push({
        ref: [fieldGetter(queryTarget.elements)],
        as: aspectFieldName
      });
    }
  }
}

module.exports = function exposeRetentionEntity(name, def, exposedEntities, m) {
  const entityName = name.split(".")[name.split(".").length - 1];

  //Add DPP Flag aspect to entity
  if (!def.query && !def.projection) {
    addBlockingAspectToBaseEntity(def, m);
    addBlockingAspectToCompositions(def.elements, m);
  } else {
    // Walk down projection hierarchy to base entity, add blocking aspect there,
    // then propagate fields up through each projection in the chain
    const chain = [];
    let current = def;
    while (current.query || current.projection) {
      chain.push(current);
      const sourceName = _getSourceEntity(_getQueryFrom(current));
      if (!sourceName) break;
      current = m.definitions[sourceName];
      if (!current) break;
    }
    if (current && !current.query && !current.projection) {
      addBlockingAspectToBaseEntity(current, m);
      addBlockingAspectToCompositions(current.elements, m);
      for (const proj of chain.reverse()) {
        ensureFieldOnProjection(proj, _getBlockingDateField, "sap.ilm.blocking", m);
        ensureFieldOnProjection(proj, _getEndOfRetentionField, "sap.ilm.destruction", m);
      }
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
    ensureFieldOnProjection(retentionEntity, _getBlockingDateField, "sap.ilm.blocking", m);
    ensureFieldOnProjection(retentionEntity, _getEndOfRetentionField, "sap.ilm.destruction", m);
  } else {
    if (retentionEntity.includes) delete retentionEntity.includes;
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
};

function addBlockingAspectToCompositions(elements, m) {
  for (const ele in elements) {
    if (elements[ele].type === "cds.Composition") {
      const def = m.definitions[elements[ele].target];
      def.includes ??= [];
      def.includes.push("sap.ilm.blocking");
      Object.assign(def.elements, m.definitions["sap.ilm.blocking"].elements);
      addBlockingAspectToCompositions(def.elements, m);
    }
  }
}
