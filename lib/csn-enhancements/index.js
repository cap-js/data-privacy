const cds = require('@sap/cds');
//const path = require("path");
const LOG = cds._dpi.log('data-privacy');
const {
  _getOrgAttributeIDField,
  _getDataSubjectIDField,
  _getEndOfBusinessDateField,
  _getBlockingDateField,
  _getEndOfRetentionField,
} = require('../utils');
const enhanceAnnotations = require('./enhanceAnnotations');
const enhanceModelWithValueLists = require('./enhanceModelWithValueLists');
const {
  assignInformationAnnotations,
  exposeCompositionsWithRewrites,
} = require('./enhanceWithDPIInformation');
const { entityValidation } = require('./modelValidations');

/**
 * Generates the DPI Information and Retention services
 * @param {CSN} m
 * @returns
 */
module.exports = function enhanceModel(m) {
  const _enhanced = 'sap.ilm.enhanced';
  if (m.meta?.[_enhanced] || m.definitions['sap.ilm.RetentionService']?.['@sap.ilm.model.enhanced'])
    return; // already enhanced
  enhanceAnnotations(m);

  const RetentionEntities = {};
  const InformationEntities = {};

  //const dpInformationModelPath = path.join(cds.root, cds.env.requires['sap.ilm.InformationService'].model.startsWith('.') ? '' : 'node_modules', cds.env.requires['sap.ilm.InformationService'].model + '.cds');
  //const dpRetentionModelPath = path.join(cds.root, cds.env.requires['sap.ilm.RetentionService'].model.startsWith('.') ? '' : 'node_modules', cds.env.requires['sap.ilm.RetentionService'].model + '.cds');
  const autoFillDPIInformationSrv =
    cds.env.requires['sap.ilm.InformationService'].model === '@sap/cds-dpi/srv/DPIInformation';
  const autoFillDPIRetentionSrv =
    cds.env.requires['sap.ilm.RetentionService'].model.startsWith('@sap/cds-dpi/srv/');

  if (!autoFillDPIInformationSrv && !autoFillDPIRetentionSrv) {
    LOG.debug(
      `Skipping DPI Information and Retention Service generation as own models are provided.`,
    );
    return m;
  }

  LOG.debug('Existing sap.ilm.RetentionService: ', m.definitions['sap.ilm.RetentionService']);
  LOG.debug('Existing sap.ilm.InformationService: ', m.definitions['sap.ilm.InformationService']);

  for (const each in m.definitions) {
    const entity = getLowestILMObjectInProjectionHierarchy(each, m);
    const def = m.definitions[entity];

    if (def.kind !== 'entity') {
      continue;
    }

    // Validation at the start to also cover incomplete entities
    entityValidation(each, m);

    if (!def['@PersonalData.EntitySemantics']) {
      continue;
    }
    if (
      entity in RetentionEntities ||
      entity in InformationEntities ||
      entity.startsWith('sap.ilm.RetentionService') ||
      entity.startsWith('sap.ilm.InformationService')
    ) {
      const originalEntity = m.definitions[each];
      if (_getBlockingDateField(def.elements) && !_getBlockingDateField(originalEntity.elements)) {
        originalEntity.elements[_getBlockingDateField(m.definitions['sap.ilm.blocking'].elements)] =
          m.definitions['sap.ilm.blocking'].elements[
            _getBlockingDateField(m.definitions['sap.ilm.blocking'].elements)
          ];
        const query = originalEntity.query?.SELECT ?? originalEntity.projection;
        if (query) {
          const queryTarget = m.definitions[query.from?.ref[0]];
          query.columns ??= ['*'];
          if (
            !query.columns.includes('*') &&
            !query.columns.some(
              (c) => c.ref && c.ref[0] === _getBlockingDateField(queryTarget.elements),
            )
          ) {
            query.columns.push({ ref: [_getBlockingDateField(def.elements)] });
          }
        }
      }
      if (
        _getEndOfRetentionField(def.elements) &&
        !_getEndOfRetentionField(originalEntity.elements)
      ) {
        originalEntity.elements[
          _getEndOfRetentionField(m.definitions['sap.ilm.destruction'].elements)
        ] =
          m.definitions['sap.ilm.destruction'].elements[
            _getEndOfRetentionField(m.definitions['sap.ilm.destruction'].elements)
          ];
        const query = originalEntity.query?.SELECT ?? originalEntity.projection;
        if (query) {
          const queryTarget = m.definitions[query.from?.ref[0]];
          query.columns ??= ['*'];
          if (
            !query.columns.includes('*') &&
            !query.columns.some(
              (c) => c.ref && c.ref[0] === _getEndOfRetentionField(queryTarget.elements),
            )
          ) {
            query.columns.push({
              ref: [_getEndOfRetentionField(def.elements)],
            });
          }
        }
      }
      continue;
    }

    //Skip data subject details if they are a composition of data subject as the data subject will include them
    if (
      def['@PersonalData.EntitySemantics'] === 'DataSubjectDetails' &&
      Object.values(def.elements).some(
        (e) =>
          e.target &&
          m.definitions[e.target]['@PersonalData.EntitySemantics'] === 'DataSubject' &&
          Object.values(m.definitions[e.target].elements).some(
            (ee) => ee.target && ee.target === each,
          ),
      )
    ) {
      continue;
    }
    const entityName = each.split('.')[each.split('.').length - 1];

    //add all composition entities to SAP DPI Information too
    //if composition entity has backlink use that to also show parent keys & semantic keys -
    //in case of parent key is ID - prefix label with parent name
    //If composition entity has no backlink than create projection out of service just to get backlink

    if (autoFillDPIInformationSrv) {
      //Add DataSubjectID field from parent - from root view also have a look at comps to one and resolve if those contain the fields
      const fields = {
        dsID: _getDataSubjectIDField(def.elements) || _getDataSubjectIDField,
      };
      const entityAlreadyExposed = !!m.definitions['sap.ilm.InformationService' + '.' + entityName];
      const informationEntity =
        m.definitions['sap.ilm.InformationService' + '.' + entityName] ??
        JSON.parse(JSON.stringify(def));
      if (!entityAlreadyExposed) {
        if (informationEntity.includes) delete informationEntity.includes;
        informationEntity.query = {
          SELECT: {
            from: { ref: [each] },
            columns: defineILMRootColumns(informationEntity, fields, m),
          },
        };
        Object.assign(informationEntity, assignInformationAnnotations(def, fields));
        m.definitions['sap.ilm.InformationService' + '.' + entityName] = informationEntity;
      }
      InformationEntities[each] = 'sap.ilm.InformationService' + '.' + entityName;
      //This adds the compositions for DPIInformation
      const composedEntities = exposeCompositionsWithRewrites(each, informationEntity, m, {
        dsFields: fields,
        redirectForParent: undefined,
        entities: InformationEntities,
        dppServiceName: 'sap.ilm.InformationService',
        assignInformationAnnotations: true,
      });
      Object.assign(m.definitions, composedEntities);

      //REVISIT: Check with containment if compositions are correctly exposed, likely composition entities need to be removed from model after they have been rewritten
    }
    if (autoFillDPIRetentionSrv) {
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
        addBlockingFlagToCompositions(def.elements, m);
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
        m.definitions['sap.ilm.RetentionService' + '.' + entityName] ??
        JSON.parse(JSON.stringify(def));
      retentionEntity['@cds.api.ignore'] = true;
      retentionEntity['@requires'] = 'InvalidRoleSoEntitiesCannotBeAccessedViaAPI';

      if (entityAlreadyExposed) {
        // If the entity is already exposed make sure the blocking and destruction properties
        // are exposed as well - else DPI is not working
        const query = retentionEntity.query?.SELECT ?? retentionEntity.projection;
        query.columns ??= ['*'];
        const queryTarget = m.definitions[query.from?.ref[0]];
        if (!_getBlockingDateField(retentionEntity.elements)) {
          retentionEntity.elements[
            _getBlockingDateField(m.definitions['sap.ilm.blocking'].elements)
          ] =
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
            from: { ref: [each] },
            columns: defineILMRootColumns(retentionEntity, fields, m),
          },
        };
        m.definitions['sap.ilm.RetentionService' + '.' + entityName] = retentionEntity;
      }
      RetentionEntities[each] = 'sap.ilm.RetentionService' + '.' + entityName;
      //For retention compositions can be added without modifying columns
      // exposeCompositions(retentionEntity, 'sap.ilm.RetentionService', RetentionEntities, m, { exposeEntities: false });
      const composedEntities = exposeCompositionsWithRewrites(each, retentionEntity, m, {
        dsFields: {},
        redirectForParent: undefined,
        entities: RetentionEntities,
        dppServiceName: 'sap.ilm.RetentionService',
        assignInformationAnnotations: false,
      });
      Object.assign(m.definitions, composedEntities);

      // DataSubjects do not have OrgAttributes / SelectionCriteria / Conditions
      if (retentionEntity['@PersonalData.EntitySemantics'] === 'Other') {
        enhanceModelWithValueLists(
          'sap.ilm.RetentionService' + '.' + entityName,
          retentionEntity,
          m,
        );
      }
    }
  }

  // handle Auto exposed entities
  for (let each in m.definitions) {
    let def = m.definitions[each];
    if (each.startsWith('sap.ilm.RetentionService') && autoFillDPIRetentionSrv) {
      exposeAutoexposedEntities(def, 'sap.ilm.RetentionService', RetentionEntities, m, {
        exposeEntities: false,
      });
    } else if (each.startsWith('sap.ilm.InformationService') && autoFillDPIInformationSrv) {
      exposeAutoexposedEntities(def, 'sap.ilm.InformationService', InformationEntities, m);
    }
  }

  // Because entities are manually added Compositions and associations have to be cleaned up so targets match the service
  for (let each in m.definitions) {
    let def = m.definitions[each];
    if (each.startsWith('sap.ilm.RetentionService') && autoFillDPIRetentionSrv) {
      fixRelationTarget(def, RetentionEntities, 'sap.ilm.RetentionService', m);
    } else if (each.startsWith('sap.ilm.InformationService') && autoFillDPIInformationSrv) {
      fixRelationTarget(def, InformationEntities, 'sap.ilm.InformationService', m);
    }
  }

  //TODO: Check if own Retention Model that functions are assigned if they are not given

  LOG.DEBUG &&
    LOG.debug(
      'DPI Information Model after modification by DPI plugin: ',
      Object.keys(m.definitions)
        .filter((k) => k === 'sap.ilm.InformationService')
        .reduce((acc, key) => {
          acc[key] = m.definitions[key];
          return acc;
        }, {}),
    );
  LOG.DEBUG &&
    LOG.debug(
      'DPI Retention Model after modification by DPI plugin: ',
      Object.keys(m.definitions)
        .filter((k) => k === 'sap.ilm.RetentionService')
        .reduce((acc, key) => {
          acc[key] = m.definitions[key];
          return acc;
        }, {}),
    );

  // REVISIT: Setting var on service is a workaround because CSN meta is not passed along compiles
  m.definitions['sap.ilm.RetentionService']['@sap.ilm.model.enhanced'] = true;

  m.meta ??= {};
  m.meta[_enhanced] = true;
  return m;
};

function getLowestILMObjectInProjectionHierarchy(entity, model) {
  const def = model.definitions[entity];
  if (
    def.query &&
    model.definitions[def.query.SELECT.from.ref[0]]['@PersonalData.EntitySemantics']
  ) {
    return getLowestILMObjectInProjectionHierarchy(def.query.SELECT.from.ref[0], model);
  } else if (
    def.projection &&
    model.definitions[def.projection.from.ref[0]]['@PersonalData.EntitySemantics']
  ) {
    return getLowestILMObjectInProjectionHierarchy(def.projection.from.ref[0], model);
  } else {
    return entity;
  }
}

function fixRelationTarget(def, exposedEntities, serviceName, model) {
  for (const ele in def.elements) {
    if (def.elements[ele].target && def.elements[ele].target.startsWith(serviceName)) {
      continue;
    }
    if (def.elements[ele].target && typeof exposedEntities[def.elements[ele].target] === 'string') {
      def.elements[ele].target = exposedEntities[def.elements[ele].target];
    } else if (def.elements[ele].target) {
      if (def.elements[ele].keys) {
        for (const key of def.elements[ele].keys) {
          //REVISIT: key.ref.join('_') is not correct for accessing .elements
          def.elements[ele + '_' + key.ref.join('_')] = JSON.parse(
            JSON.stringify(model.definitions[def.elements[ele].target].elements[key.ref.join('_')]),
          );
          Object.keys(def.elements[ele])
            .filter((prop) => prop.startsWith('@'))
            .forEach((anno) => {
              def.elements[ele + '_' + key.ref.join('_')][anno] = def.elements[ele][anno];
            });
          const query = def.query?.SELECT ?? def.projection;
          query.columns ??= ['*'];
          query.columns.push({
            ref: [ele].concat(key.ref),
            as: ele + '_' + key.ref.join('_'),
          });
          if (query.columns.some((c) => c.ref && c.ref.length === 1 && c.ref[0] === ele)) {
            const idx = query.columns.findIndex(
              (c) => c.ref && c.ref.length === 1 && c.ref[0] === ele,
            );
            query.columns.splice(idx, 1);
          }
        }
      }
      delete def.elements[ele];
      const query = def.query?.SELECT ?? def.projection;
      query.excluding ??= [];
      if (!query.excluding.some((e) => e === ele)) {
        query.excluding.push(ele);
      }
    }
  }
}

function exposeCompositions(
  def,
  srvPrefix,
  exposedEntities,
  m,
  options = { exposeEntities: true },
) {
  const compositons = Object.entries(def.elements).filter(([, e]) => e.type === 'cds.Composition'); //REVISIT: Possible problem if one hides the compositon behind a custom type
  if (compositons.length > 0) {
    for (const [, comp] of compositons) {
      let compEntityName = comp.target.split('.')[comp.target.split('.').length - 1];
      if (compEntityName === 'texts') {
        compEntityName = comp.target.split('.')[comp.target.split('.').length - 2] + '.texts';
      }
      const entityAlreadyExposed = !!m.definitions[srvPrefix + '.' + compEntityName];
      const newCompEntity =
        m.definitions[srvPrefix + '.' + compEntityName] ??
        JSON.parse(JSON.stringify(m.definitions[comp.target]));
      if (!options.exposeEntities) {
        newCompEntity['@cds.api.ignore'] = true;
        newCompEntity['@requires'] = 'InvalidRoleSoEntitiesCannotBeAccessedViaAPI';
      }
      if (!entityAlreadyExposed) {
        if (newCompEntity.includes) delete newCompEntity.includes;
        newCompEntity.projection = {
          from: { ref: [comp.target] },
        };
        m.definitions[srvPrefix + '.' + compEntityName] = newCompEntity;
      }
      exposedEntities[comp.target] = srvPrefix + '.' + compEntityName;
      comp.target = srvPrefix + '.' + compEntityName;
      exposeCompositions(newCompEntity, srvPrefix, exposedEntities, m, options);
    }
  }
}

function exposeAutoexposedEntities(
  def,
  srvName,
  srvEntityMappings,
  m,
  options = { exposeEntities: true },
) {
  for (const ele in def.elements) {
    const compEntityName =
      def.elements[ele].target?.split('.')[def.elements[ele].target?.split('.').length - 1];
    if (
      def.elements[ele].target &&
      !srvEntityMappings[def.elements[ele].target] &&
      m.definitions[def.elements[ele].target]['@cds.autoexpose']
    ) {
      if (!m.definitions[srvName + '.' + compEntityName]) {
        const newCompEntity = JSON.parse(JSON.stringify(m.definitions[def.elements[ele].target]));
        if (newCompEntity.includes) delete newCompEntity.includes;
        newCompEntity.projection = {
          from: { ref: [def.elements[ele].target] },
        };
        m.definitions[srvName + '.' + compEntityName] = newCompEntity;
        if (!options.exposeEntities) {
          newCompEntity['@cds.api.ignore'] = true;
          newCompEntity['@requires'] = 'InvalidRoleSoEntitiesCannotBeAccessedViaAPI';
        }
        srvEntityMappings[def.elements[ele].target] = srvName + '.' + compEntityName;
        def.elements[ele].target = srvName + '.' + compEntityName;
      }
      exposeCompositions(
        m.definitions[srvName + '.' + compEntityName],
        srvName,
        srvEntityMappings,
        m,
        options,
      );
    }
  }
}

const gCompsToOne = (elements) =>
  Object.entries(elements).filter(
    ([, e]) => e.type === 'cds.Composition' && e.cardinality && e.cardinality.max === 1,
  ); //REVISIT: Is possible issue for compositions hidden behind a custom type

function searchInCompForField(def, fn, model) {
  const compsToOne = gCompsToOne(def.elements);
  for (const [n, c] of compsToOne) {
    const ce = model.definitions[c.target];
    if (fn(ce.elements)) {
      return {
        as: [n, fn(ce.elements)].join('.'),
        def: ce.elements[fn(ce.elements)],
      };
    }
    const r = searchInCompForField(ce, fn, model);
    if (r) {
      return { as: [n, r.as].join('.'), def: r.def };
    }
  }
  return null;
}

/**
 * Makes sure Data subject, Org Attribute and end of business date are fields on the root for direct access. Logic handlers require these fields to be directly on root.
 */
function defineILMRootColumns(newEntity, fields, model) {
  let additionalFields = ['*'];
  for (const field in fields) {
    if (typeof fields[field] === 'function') {
      const actualField = searchInCompForField(newEntity, fields[field], model);
      if (actualField) {
        additionalFields.push({
          ref: actualField.as.split('.'),
          as: actualField.as.split('.').join('_'),
        });
        newEntity.elements[actualField.as.split('.').join('_')] = actualField.def;
        fields[field] = actualField.as;
      }
    }
  }
  return additionalFields;
}

function addBlockingFlagToCompositions(elements, m) {
  for (const ele in elements) {
    if (elements[ele].type === 'cds.Composition') {
      const def = m.definitions[elements[ele].target];
      def.includes ??= [];
      def.includes.push('sap.ilm.blocking');
      Object.assign(def.elements, m.definitions['sap.ilm.blocking'].elements);
      addBlockingFlagToCompositions(def.elements, m);
    }
  }
}
