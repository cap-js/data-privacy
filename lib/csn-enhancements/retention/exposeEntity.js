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
const { propagateAspectToProjections, getProjectionsBySource } = require("./propagateAspectFields");

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

module.exports = function exposeRetentionEntity(name, def, exposedEntities, m) {
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
};

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
