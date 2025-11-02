const cds = require('@sap/cds'), path = require("path");
const LOG = cds.log('data-privacy')
const { _getLegalEntityIDField, _getDataSubjectIDField, _getEndOfBusinessDateField, getOrgAttributes } = require('../utils');
const enhanceAnnotations = require('./enhanceAnnotations');

/**
 * Generates the DPI Information and Retention services
 * @param {CSN} m 
 * @returns 
 */
module.exports = function enhanceModel(m) {

  const _enhanced = 'sap.dpi.enhanced'
  if (m.meta?.[_enhanced]) return // already enhanced

  enhanceAnnotations(m);
  
  const DRMEntities = {};
  const PDMEntities = {};


  const dpInformationModelPath = path.join(cds.root, cds.env.requires['data-privacy-information'].model.startsWith('.') ? '' : 'node_modules', cds.env.requires['data-privacy-information'].model + '.cds');
  const dpRetentionModelPath = path.join(cds.root, cds.env.requires['data-privacy-retention'].model.startsWith('.') ? '' : 'node_modules', cds.env.requires['data-privacy-retention'].model + '.cds');
  const autoFillDPIInformationSrv = cds.env.requires['data-privacy-information'].model === '@sap/cds-dpi/srv/DPIInformation';
  const autoFillDPIRetentionSrv = cds.env.requires['data-privacy-retention'].model.startsWith('@sap/cds-dpi/srv/');

  if (!autoFillDPIInformationSrv && !autoFillDPIRetentionSrv) {
    LOG.debug(`Skipping DPI Information and Retention Service generation as own models are provided.`)
    return m;
  }

  LOG.debug('Existing DPIRetentionService: ', m.definitions.DPIRetentionService)
  LOG.debug('Existing DPIInformationService: ', m.definitions.DPIInformationService)

  for (const each in m.definitions) {
    const entity = getLowestILMObjectInProjectionHierarchy(each, m);
    const def = m.definitions[entity];
    if (entity in DRMEntities || entity in PDMEntities || def.kind !== 'entity' || !def['@PersonalData.EntitySemantics'] || entity.startsWith('DPIRetentionService') || entity.startsWith('DPIInformationService')) {
      continue;
    }

    //Skip data subject details if they are a composition of data subject as the data subject will include them
    if (
      def['@PersonalData.EntitySemantics'] === 'DataSubjectDetails' &&
      Object.values(def.elements).some(e =>
        e.target &&
        m.definitions[e.target]['@PersonalData.EntitySemantics'] === 'DataSubject' &&
        Object.values(m.definitions[e.target].elements).some(ee => ee.target && ee.target === each)
      )
    ) {
      continue;
    }
    const entityName = each.split('.')[each.split('.').length - 1]

    //add all composition entities to PDM too 
    //if composition entity has backlink use that to also show parent keys & semantic keys - 
    //in case of parent key is ID - prefix label with parent name
    //If composition entity has no backlink than create projection out of service just to get backlink

    if (autoFillDPIInformationSrv) {
      //Add DataSubjectID field from parent - from root view also have a look at comps to one and resolve if those contain the fields
      const fields = {
        dsID: _getDataSubjectIDField(def.elements) || _getDataSubjectIDField,
      }
      const newInformationEntity = JSON.parse(JSON.stringify(def));
      if (newInformationEntity.includes) delete newInformationEntity.includes;
      newInformationEntity.query = {
        SELECT: {
          from: { ref: [each] },
          columns: defineILMRootColumns(newInformationEntity, fields, m)
        }
      };
      PDMEntities[each] = 'DPIInformationService' + '.' + entityName
      m.definitions['DPIInformationService' + '.' + entityName] = newInformationEntity;

      //This adds the compositions for DPIInformation
      const composedEntities = exposeCompositionsWithRewrites(each, newInformationEntity, fields, m, undefined, PDMEntities);
      Object.assign(m.definitions, composedEntities);

      //REVISIT: Check with containment if compositions are correctly exposed, likely composition entities need to be removed from model after they have been rewritten
      //TODO Check if Expose Condition associations is necessary
      exposeOrgAttribute(newInformationEntity, PDMEntities, 'DPIInformationService', m);
    }
    if (autoFillDPIRetentionSrv) {

      //Add DPP Flag aspect to entity
      if (!def.query && !def.projection) {
        Object.assign(def.elements, m.definitions['sap.dpi.dppFlags'].elements);
        def.includes ??= []
        def.includes.push('sap.dpi.dppFlags');
      } else {
        //TODO: Go down, add flag to table and add fields to projections in between
      }

      //Add DataSubjectID, DataControllerID and EndOfBusinessDate fields from parent - from root view also have a look at comps to one and resolve if those contain the fields
      const fields = {
        legalID: _getLegalEntityIDField(def.elements) || _getLegalEntityIDField,
        dsID: _getDataSubjectIDField(def.elements) || _getDataSubjectIDField,
        eob: _getEndOfBusinessDateField(def.elements) || _getEndOfBusinessDateField
      }
      const newRetentionEntity = JSON.parse(JSON.stringify(def));
      newRetentionEntity['@cds.drm.rootEntity'] = true;
      newRetentionEntity['@cds.api.ignore'] = true;
      if (newRetentionEntity.includes) delete newRetentionEntity.includes;
      newRetentionEntity.query = {
        SELECT: {
          from: { ref: [each] },
          columns: defineILMRootColumns(newRetentionEntity, fields, m)
        }
      };
      DRMEntities[each] = 'DPIRetentionService' + '.' + entityName
      Object.assign(newRetentionEntity, assignInformationAnnotations(def, fields));
      m.definitions['DPIRetentionService' + '.' + entityName] = newRetentionEntity;
      //For retention compositions can be added without modifying columns
      exposeCompositions(newRetentionEntity, 'DPIRetentionService', DRMEntities, m);

      exposeOrgAttribute(newRetentionEntity, DRMEntities, 'DPIRetentionService', m);
    }
  }

  // handle Auto exposed entities
  for (let each in m.definitions) {
    let def = m.definitions[each];
    if (each.startsWith('DPIRetentionService') && autoFillDPIRetentionSrv) {
      exposeAutoexposedEntities(def, 'DPIRetentionService', DRMEntities, m)
    } else if (each.startsWith('DPIInformationService') && autoFillDPIInformationSrv) {
      exposeAutoexposedEntities(def, 'DPIInformationService', PDMEntities, m)
    }
  }

  // Because entities are manually added Compositions and associations have to be cleaned up so targets match the service
  for (let each in m.definitions) {
    let def = m.definitions[each];
    if (each.startsWith('DPIRetentionService') && autoFillDPIRetentionSrv) {
      fixRelationTarget(def, DRMEntities);
    } else if (each.startsWith('DPIInformationService') && autoFillDPIInformationSrv) {
      fixRelationTarget(def, PDMEntities);
    }
  }

  //TODO: Check if own Retention Model that functions are assigned if they are not given

  LOG.DEBUG && LOG.debug('DPI Information Model after modification by DPI plugin: ', Object.keys(m.definitions).filter(k => k === 'DPIInformationService').reduce((acc, key) => {
    acc[key] = m.definitions[key]
    return acc;
  }, {}))
  LOG.DEBUG && LOG.debug('DPI Retention Model after modification by DPI plugin: ', Object.keys(m.definitions).filter(k => k === 'DPIRetentionService').reduce((acc, key) => {
    acc[key] = m.definitions[key]
    return acc;
  }, {}))

  m.meta ??= {}
  m.meta[_enhanced] = true;
  return m
}

function exposeOrgAttribute(def, exposedEntities, srvName, model) {
  const orgAttributeAssociations = getOrgAttributes(def.elements);
  for (const orgAttributeAssociation of orgAttributeAssociations) {
    if (!exposedEntities[orgAttributeAssociation.target]) {
      const orgAttribute = model.definitions[orgAttributeAssociation.target];
      const newOrgAttribute = JSON.parse(JSON.stringify(orgAttribute));
      if (newOrgAttribute.includes) {
        delete newOrgAttribute.includes;
      }
      newOrgAttribute.projection = {
        from: { ref: [orgAttributeAssociation.target] }
      };
      const orgAttributeName = orgAttributeAssociation.target.split('.')[orgAttributeAssociation.target.split('.').length - 1]
      exposedEntities[orgAttributeAssociation.target] = srvName + '.' + orgAttributeName
      model.definitions[srvName + '.' + orgAttributeName] = newOrgAttribute;
    }
  }
}

function getLowestILMObjectInProjectionHierarchy(entity, model) {
  const def = model.definitions[entity];
  if (def.query && model.definitions[def.query.SELECT.from.ref[0]]['@PersonalData.EntitySemantics']) {
    return getLowestILMObjectInProjectionHierarchy(def.query.SELECT.from.ref[0], model);
  } else if (def.projection && model.definitions[def.projection.from.ref[0]]['@PersonalData.EntitySemantics']) {
    return getLowestILMObjectInProjectionHierarchy(def.projection.from.ref[0], model);
  } else {
    return entity;
  }
}

function fixRelationTarget(def, exposedEntities) {
  for (const ele in def.elements) {
    if (def.elements[ele].target && typeof exposedEntities[def.elements[ele].target] === 'string') {
      def.elements[ele].target = exposedEntities[def.elements[ele].target];
    } else if (def.elements[ele].target) {
      delete def.elements[ele];
      if (def.query) {
        def.query.SELECT.excluding ??= []
        if (!def.query.SELECT.excluding.some(e => e === ele)) {
          def.query.SELECT.excluding.push(ele);
        }
      } else if (def.projection) {
        def.projection.excluding ??= []
        if (!def.projection.excluding.some(e => e === ele)) {
          def.projection.excluding.push(ele);
        }
      }
    }
  }
}

function exposeCompositions(def, srvPrefix, exposedEntities, m) {
  const compositons = Object.entries(def.elements).filter(([, e]) => e.type === 'cds.Composition') //REVISIT: Possible problem if one hides the compositon behind a custom type
  if (compositons.length > 0) {
    for (const [, comp] of compositons) {
      const newCompEntity = JSON.parse(JSON.stringify(m.definitions[comp.target]));
      newCompEntity['@cds.drm.rootEntity'] = true;
      if (newCompEntity.includes) delete newCompEntity.includes;
      newCompEntity.projection = {
        from: { ref: [comp.target] }
      };
      let compEntityName = comp.target.split('.')[comp.target.split('.').length - 1]
      if (compEntityName === 'texts') {
        compEntityName = comp.target.split('.')[comp.target.split('.').length - 2] + '.texts'
      }
      exposedEntities[comp.target] = srvPrefix + '.' + compEntityName;
      m.definitions[srvPrefix + '.' + compEntityName] = newCompEntity;
      comp.target = srvPrefix + '.' + compEntityName;
      exposeCompositions(newCompEntity, srvPrefix, exposedEntities, m);
    }
  }
}

function exposeAutoexposedEntities(def, srvName, srvEntityMappings, m) {
  for (const ele in def.elements) {
    const compEntityName = def.elements[ele].target?.split('.')[def.elements[ele].target?.split('.').length - 1]
    if (def.elements[ele].target && !srvEntityMappings[def.elements[ele].target] && m.definitions[def.elements[ele].target]['@cds.autoexpose']) {
      if (!m.definitions[srvName + '.' + compEntityName]) {
        const newCompEntity = JSON.parse(JSON.stringify(m.definitions[def.elements[ele].target]));
        if (newCompEntity.includes) delete newCompEntity.includes;
        newCompEntity.projection = {
          from: { ref: [def.elements[ele].target] }
        };
        m.definitions[srvName + '.' + compEntityName] = newCompEntity;
        srvEntityMappings[def.elements[ele].target] = srvName + '.' + compEntityName;
        def.elements[ele].target = srvName + '.' + compEntityName;
      }
      exposeCompositions(m.definitions[srvName + '.' + compEntityName], srvName, srvEntityMappings, m);
    }
  }
}

function searchInCompForField(def, fn, model) {
  const compsToOne = gCompsToOne(def.elements)
  for (const [n, c] of compsToOne) {
    const ce = model.definitions[c.target]
    if (fn(ce.elements)) {
      return { as: [n, fn(ce.elements)].join('.'), def: ce.elements[fn(ce.elements)] }
    }
    const r = searchInCompForField(ce, fn, model)
    if (r) {
      return { as: [n, r.as].join('.'), def: r.def };
    }
  }
  return null
}

/**
 * Makes sure Data subject, Org Attribute and end of business date are fields on the root for direct access. Logic handlers require these fields to be directly on root.
 */
function defineILMRootColumns(newEntity, fields, model) {
  let additionalFields = ['*']
  for (const field in fields) {
    if (typeof fields[field] === 'function') {
      const actualField = searchInCompForField(newEntity, fields[field], model)
      if (actualField) {
        additionalFields.push({ ref: actualField.as.split('.'), as: actualField.as.split('.').join('_') })
        newEntity.elements[actualField.as.split('.').join('_')] = actualField.def
        fields[field] = actualField.as
      }
    }
  }
  return additionalFields
}

const hasBacklink = (elements, parent) => Object.values(elements).some(e => e.target && e.target === parent)
const backlink = (elements, parent) => Object.entries(elements).find(([, e]) => e.target && e.target === parent)[0]
const gCompsToOne = elements => Object.entries(elements).filter(([, e]) => e.type === 'cds.Composition' && e.cardinality && e.cardinality.max === 1) //REVISIT: Is possible issue for compositions hidden behind a custom type

const fieldsFn = {
  legalID: _getLegalEntityIDField,
  dsID: _getDataSubjectIDField,
  eob: _getEndOfBusinessDateField
}
const compCondition = (name, cmp, backLinkName) => {
  if (cmp.on && backLinkName) {
    return JSON.parse(JSON.stringify(cmp.on)).reduce((acc, val) => {
      if (val.ref) {
        if (val.ref[0] === name) {
          val.ref.shift()
        } else {
          val.ref = [backLinkName, ...val.ref]
        }
      }
      acc.push(val)
      return acc
    }, [])
  } else if (cmp.on) {
    return cmp.on;
  } else if (cmp.keys) {
    return JSON.parse(JSON.stringify(cmp.keys)).reduce((acc, val) => {
      if (acc.length > 0) {
        acc.push('and')
      }
      acc.push(
        { ref: [name, val.ref[0]] },
        '=',
        { ref: ['$self', `${name}_${val.ref[0]}`] } //REVISIT if it has to be . or _
      );
      return acc
    }, [])
  }
}
const exposeCompositionsWithRewrites = (fullName, parentDefinition, dsFields, m, redirectForParent = false, PDMEntities) => {
  let result = {}
  const compositons = Object.entries(parentDefinition.elements).filter(([, e]) => e.type === 'cds.Composition') //REVISIT: Possible problem if one hides the compositon behind a custom type
  if (compositons.length > 0) {
    const parentName = fullName.split('.')[fullName.split('.').length - 1]
    const semanticKeys = parentDefinition['@Common.SemanticKey'] ? parentDefinition['@Common.SemanticKey'].map(m => m['=']) : []
    for (const [name, comp] of compositons) {
      const entity = m.definitions[comp.target];
      const entityName = comp.target.split('.')[comp.target.split('.').length - 1]
      PDMEntities[comp.target] = 'DPIInformationService.' + entityName
      let backLinkName = hasBacklink(entity.elements, fullName) ? backlink(entity.elements, fullName) : 'backlink';
      const newDsFields = { ...dsFields }
      const mixinFieldsToExclude = []

      const newEntity = JSON.parse(JSON.stringify(entity));
      if (newEntity.includes) delete newEntity.includes;

      function mixin() {
        const additionalFields = {}

        if (!hasBacklink(entity.elements, fullName)) {
          additionalFields[backLinkName] = {
            type: 'cds.Association',
            target: 'DPIInformationService.' + parentName,
            cardinality: { max: 1 },
            on: compCondition(name, comp, backLinkName)
          }
        }
        if (redirectForParent) {
          additionalFields[backLinkName] = {
            type: 'cds.Association',
            target: 'DPIInformationService.' + parentName,
            cardinality: { max: 1 },
            on: compCondition(backLinkName, entity.elements[backLinkName])
          }
        }
        if (redirectForParent) mixinFieldsToExclude.push(backLinkName)
        if (!hasBacklink(entity.elements, fullName)) { //In that case the children need to rewrite backlink and hence comp needs to be mixed in
          const children = Object.entries(entity.elements).filter(([, e]) => e.type === 'cds.Composition') //REVISIT: Possible problem if one hides the compositon behind a custom type
          for (const [cname, child] of children) {
            mixinFieldsToExclude.push(cname)
            additionalFields[cname] = {
              type: 'cds.Composition',
              target: child.target,
              cardinality: child.cardinality && child.cardinality.max == '1' ? { max: 1 } : { max: '*' },
              on: compCondition(cname, child)
            }
          }
        }
        return additionalFields
      }

      function columns() {
        const additionalFields = ['*', { ref: [backLinkName] }];
        const formatter = (f) => {
          return { ref: [backLinkName, ...f.split('.')], as: `${backLinkName}_${f.replace('.', '_')}` }
        }
        //Add keys and semantic keys - label ID keys as "<entity> ID"
        //Dont render foreign keys
        additionalFields.push(...Object.entries(parentDefinition.elements)
          .filter(([n, e]) =>
            e.key &&
            !entity.elements[`${backLinkName}_${n}`] &&
            !comp.on.some(o => o.ref && o.ref[0] === n) &&
            (
              !entity.elements[backLinkName] ||
              !entity.elements[backLinkName].keys.some(k => k.ref[0] === n)
            )
          )
          .map(([n]) => {
            let r = formatter(n);
            newEntity.elements[r.as] = parentDefinition.elements[n]
            if (n === 'ID') {
              newEntity.elements[r.as]['@Common.Label'] = `${parentName} ID`;
            }
            return r;
          })
        )
        additionalFields.push(...semanticKeys.map(n => {
          const newField = formatter(n);
          newEntity.elements[newField.as] = parentDefinition.elements[n];
          return newField;
        }))
        //Add privacy related fields
        for (const field in dsFields) {
          if (fieldsFn[field](entity.elements)) {
            newDsFields[field] = fieldsFn[field](entity.elements)
          }
          //last check in case managed assoc is such a field already 
          else if (
            typeof dsFields[field] !== 'function' &&
            dsFields[field] &&
            !additionalFields.some(a =>
              a?.as === formatter(dsFields[field]).as ||
              (
                a?.ref && a?.ref.join('.') === backLinkName &&
                entity.elements[backLinkName] &&
                entity.elements[backLinkName].keys.some(k => k.ref[0] === dsFields[field])
              )
            )
          ) {
            const newField = formatter(dsFields[field]);
            newEntity.elements[newField.as] = parentDefinition.elements[dsFields[field].replaceAll('.', '_')];
            additionalFields.push(newField);
            newDsFields[field] = !redirectForParent && entity.elements[backLinkName] ? `${backLinkName}.${dsFields[field]}` : `${backLinkName}_${dsFields[field]}`
          }
        }
        //Add keys to select for mixin
        if (redirectForParent && entity.elements[backLinkName] && entity.elements[backLinkName].keys) {
          entity.elements[backLinkName].keys.forEach(k => {
            const f = formatter(k.ref[0])
            if (!additionalFields.some(a => a === f)) {
              additionalFields.push(f);
              newEntity.elements[f.as] = parentDefinition.elements[k.ref[0]];
            }
          })
        }
        //Add to exclude fields if not already present, to ensure that mixed in fields are used
        mixinFieldsToExclude.forEach(f => {
          if (!additionalFields.some(addField => addField.ref && addField.ref.join('.') === f)) {
            additionalFields.push({ ref: f.split('.') })
          }
        })
        return additionalFields
      }

      const mixinFields = mixin();
      newEntity.query = {
        SELECT: {
          from: { ref: [comp.target] },
          columns: columns(), //columns has to run before annotations so the references of dsFields are correct
        }
      };
      if (Object.keys(mixinFields).length > 0) {
        newEntity.query.SELECT.mixin = mixinFields;
        Object.assign(newEntity.elements, mixinFields);
      }
      if (mixinFieldsToExclude.length > 0) {
        newEntity.query.SELECT.excluding = mixinFieldsToExclude
      }
      if (!newEntity['@PersonalData.DataSubjectRole']) newEntity['@PersonalData.DataSubjectRole'] = parentDefinition['@PersonalData.DataSubjectRole']
      if (!newEntity['@PersonalData.EntitySemantics']) newEntity['@PersonalData.EntitySemantics'] = parentDefinition['@PersonalData.EntitySemantics']
      Object.assign(newEntity, assignInformationAnnotations(newEntity, newDsFields));

      result['DPIInformationService.' + entityName] = newEntity;

      //REVISIT - does not add deeper than 1 level as added backlinks cannot be referenced in deeper comps 
      Object.assign(result, exposeCompositionsWithRewrites(comp.target, newEntity, newDsFields, m, !hasBacklink(entity.elements, fullName), PDMEntities));
    }
  }
  return result
}

const managedFields = { createdBy: 1, createdAt: 1, modifiedBy: 1, modifiedAt: 1 }

function assignInformationAnnotations(entity, dsFields) {
  let result = {
    '@PersonalData.DataSubjectRole': entity['@PersonalData.DataSubjectRole'],
    '@PersonalData.EntitySemantics': entity['@PersonalData.EntitySemantics']
  }
  //TODO: Consider UI.Hidden or think about it, as those columns cannot be shown anyways - @PersonalData obviously would overule, but in the other cases it would make sense
  if (!entity['@UI.LineItem']) {
    //Show key first
    //Than semantic keys
    //Than end of business
    //Than all other fields 
    const hasManaged = entity.includes && entity.includes.some(i => i === 'managed')
    const semanticKeys = entity['@Common.SemanticKey'] ? entity['@Common.SemanticKey'].map(m => m['=']) : []
    const asLineItem = (field) => ({ Value: { '=': field } })
    const lineItemElementMapping = ([field, element]) => {
      if (element.keys) {
        //REVISIT: Arbitrary limitation that only first key values are taken over
        return asLineItem(field + '_' + element.keys[0].ref.join('_'))
      } else return asLineItem(field)
    }
    //Only fields which are not yet added and possible (e.g. exclude assocs/comps without foreign key or which are to many) + sort after which contain personal data
    const otherFields = Object.entries(entity.elements).filter(([n, e]) =>
      !e.key &&
      (!(e.type === 'cds.Association' || e.type === 'cds.Composition' || (!e.keys && e.on)) || e.keys) &&
      n !== dsFields.eob && !semanticKeys.some(s => s === n)
    ).sort(([, e1], [, e2]) => {
      if (
        (e1['@PersonalData.IsPotentiallySensitive'] && !e2['@PersonalData.IsPotentiallySensitive']) ||
        (e1['@PersonalData.IsPotentiallyPersonal'] && !e2['@PersonalData.IsPotentiallySensitive'] && !e2['@PersonalData.IsPotentiallyPersonal'])
      )
        return -1
      if (
        (e2['@PersonalData.IsPotentiallySensitive'] && !e1['@PersonalData.IsPotentiallySensitive']) ||
        (e2['@PersonalData.IsPotentiallyPersonal'] && !e1['@PersonalData.IsPotentiallySensitive'] && !e1['@PersonalData.IsPotentiallyPersonal'])
      )
        return 1
      return 0
    })
    //Ensure that in other fields managed fields are at the end
    if (hasManaged) {
      for (const m in managedFields) {
        const index = otherFields.indexOf(otherFields.find(([n]) => n === m))
        otherFields.push(...otherFields.splice(index, 1))
      }
    }
    result['@UI.LineItem'] = [
      ...Object.entries(entity.elements).filter(([, e]) => e.key).map(lineItemElementMapping),
      ...semanticKeys.map(m => asLineItem(m)),
      ...(dsFields.eob !== null && typeof dsFields.eob !== 'function' ? [asLineItem(dsFields.eob)] : []),
      ...otherFields.map(lineItemElementMapping)
    ]
  }

  if (!Object.keys(entity).some(k => k.startsWith('@UI.FieldGroup'))) {
    result['@UI.FieldGroup#CAP_DPI_GENERATED.Label'] = entity['@Core.Description']
      || entity['@description']
      || (entity['@PersonalData.EntitySemantics'] === 'DataSubjectDetails' ? 'Data subject details' : 'Details') //REVISIT - make last one translatable
    result['@UI.FieldGroup#CAP_DPI_GENERATED.Data'] = entity['@UI.LineItem'] ?? result['@UI.LineItem']
  }

  return result
}