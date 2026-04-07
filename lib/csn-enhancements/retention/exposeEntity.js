const {
  _getBlockingDateField,
  _getEndOfRetentionField,
  _getOrgAttributeIDField,
  _getDataSubjectIDField,
  _getEndOfBusinessDateField,
} = require('../../utils');
const { exposeCompositionsWithRewrites } = require('../shared/compositionsRewrite');
const {
  redirectAssociationsToServiceIfPossible,
  defineILMRootColumns,
} = require('../shared/entityExposure');
const enhanceModelWithValueLists = require('./enhanceModelWithValueLists');

module.exports = function exposeRetentionEntity(name, def, exposedEntities, m) {
  const entityName = name.split('.')[name.split('.').length - 1];

  //Add DPP Flag aspect to entity
  if (!def.query && !def.projection) {
    if (!_getBlockingDateField(def.elements) && !_getEndOfRetentionField(def.elements)) {
      Object.assign(def.elements, m.definitions['sap.ilm.blocking'].elements);
      Object.assign(def.elements, m.definitions['sap.ilm.destruction'].elements);
      def.includes ??= [];
      def.includes.push('sap.ilm.blocking', 'sap.ilm.destruction');
    } else if (!_getBlockingDateField(def.elements)) {
      def.elements[_getBlockingDateField(m.definitions['sap.ilm.blocking'].elements)] =
        m.definitions['sap.ilm.blocking'].elements[
          _getBlockingDateField(m.definitions['sap.ilm.blocking'].elements)
        ];
    } else if (!_getEndOfRetentionField(def.elements)) {
      def.elements[_getEndOfRetentionField(m.definitions['sap.ilm.destruction'].elements)] =
        m.definitions['sap.ilm.destruction'].elements[
          _getEndOfRetentionField(m.definitions['sap.ilm.destruction'].elements)
        ];
    }
    addBlockingAspectToCompositions(def.elements, m);
  } else {
    //TODO: Go down, add flag to table and add fields to projections in between
  }

  //Add DataSubjectID, DataControllerID and EndOfBusinessDate fields from parent - from root view also have a look at comps to one and resolve if those contain the fields
  const fields = {
    legalID: _getOrgAttributeIDField(def.elements) || _getOrgAttributeIDField,
    dsID: _getDataSubjectIDField(def.elements) || _getDataSubjectIDField,
    eob: _getEndOfBusinessDateField(def.elements) || _getEndOfBusinessDateField,
  };
  const entityAlreadyExposed = !!m.definitions['sap.ilm.RetentionService' + '.' + entityName];
  const retentionEntity =
    m.definitions['sap.ilm.RetentionService' + '.' + entityName] ?? structuredClone(def);
  retentionEntity['@cds.api.ignore'] = true;
  retentionEntity['@requires'] = 'InvalidRoleSoEntitiesCannotBeAccessedViaAPI';

  if (entityAlreadyExposed) {
    // If the entity is already exposed make sure the blocking and destruction properties
    // are exposed as well - else DPI is not working
    const query = retentionEntity.query?.SELECT ?? retentionEntity.projection;
    query.columns ??= ['*'];
    const queryTarget = m.definitions[query.from?.ref[0]];
    if (!_getBlockingDateField(retentionEntity.elements)) {
      retentionEntity.elements[_getBlockingDateField(m.definitions['sap.ilm.blocking'].elements)] =
        m.definitions['sap.ilm.blocking'].elements[
          _getBlockingDateField(m.definitions['sap.ilm.blocking'].elements)
        ];
      if (
        !query.columns.includes('*') &&
        !query.columns.some(
          (c) => c.ref && c.ref[0] === _getBlockingDateField(queryTarget.elements),
        )
      ) {
        query.columns.push({
          ref: [_getBlockingDateField(queryTarget.elements)],
          as: _getBlockingDateField(m.definitions['sap.ilm.blocking'].elements),
        });
      }
    }
    if (!_getEndOfRetentionField(retentionEntity.elements)) {
      retentionEntity.elements[
        _getEndOfRetentionField(m.definitions['sap.ilm.destruction'].elements)
      ] =
        m.definitions['sap.ilm.destruction'].elements[
          _getEndOfRetentionField(m.definitions['sap.ilm.destruction'].elements)
        ];
      if (
        !query.columns.includes('*') &&
        !query.columns.some(
          (c) => c.ref && c.ref[0] === _getEndOfRetentionField(queryTarget.elements),
        )
      ) {
        query.columns.push({
          ref: [_getEndOfRetentionField(queryTarget.elements)],
          as: _getEndOfRetentionField(m.definitions['sap.ilm.destruction'].elements),
        });
      }
    }
  } else {
    if (retentionEntity.includes) delete retentionEntity.includes;
    retentionEntity.query = {
      SELECT: {
        from: { ref: [name] },
        columns: defineILMRootColumns(retentionEntity, fields, m),
      },
    };
    m.definitions['sap.ilm.RetentionService' + '.' + entityName] = retentionEntity;
  }
  exposedEntities[name] = 'sap.ilm.RetentionService' + '.' + entityName;
  //For retention compositions can be added without modifying columns
  const composedEntities = exposeCompositionsWithRewrites(name, retentionEntity, m, {
    dsFields: {},
    redirectForParent: undefined,
    entities: exposedEntities,
    dppServiceName: 'sap.ilm.RetentionService',
    assignInformationAnnotations: false,
    rmCompsToTransactionalRecords: true,
  });
  Object.assign(m.definitions, composedEntities);

  // DataSubjects do not have OrgAttributes / SelectionCriteria / Conditions
  if (retentionEntity['@PersonalData.EntitySemantics'] === 'Other') {
    redirectAssociationsToServiceIfPossible(retentionEntity, 'sap.ilm.RetentionService', m);
    enhanceModelWithValueLists('sap.ilm.RetentionService' + '.' + entityName, retentionEntity, m);
  }
};

function addBlockingAspectToCompositions(elements, m) {
  for (const ele in elements) {
    if (elements[ele].type === 'cds.Composition') {
      const def = m.definitions[elements[ele].target];
      def.includes ??= [];
      def.includes.push('sap.ilm.blocking');
      Object.assign(def.elements, m.definitions['sap.ilm.blocking'].elements);
      addBlockingAspectToCompositions(def.elements, m);
    }
  }
}
