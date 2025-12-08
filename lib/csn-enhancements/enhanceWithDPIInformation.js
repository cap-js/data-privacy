const cds = require('@sap/cds');
const LOG = cds._dpi.log('data-privacy');

const { _getOrgAttributeIDField, _getDataSubjectIDField, _getEndOfBusinessDateField } = require("../utils")

const hasBacklink = (elements, parent) => Object.values(elements).some(e => e.target && e.target === parent)
const backlink = (elements, parent) => Object.entries(elements).find(([, e]) => e.target && e.target === parent)[0]

const fieldsFn = {
  legalID: _getOrgAttributeIDField,
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
const exposeCompositionsWithRewrites = (fullName, parentDefinition, m, o = {dsFields: undefined, redirectForParent: false, entities: {}, dppServiceName: null, assignInformationAnnotations: true, exposeEntities: true}) => {
  let result = {}
  const compositions = Object.entries(parentDefinition.elements).filter(([, e]) => e.type === 'cds.Composition') //REVISIT: Possible problem if one hides the composition behind a custom type
  if (compositions.length > 0) {
    const parentName = fullName.split('.')[fullName.split('.').length - 1]
    const semanticKeys = parentDefinition['@Common.SemanticKey'] ? parentDefinition['@Common.SemanticKey'].map(m => m['=']) : []
    for (const [name, comp] of compositions) {

      // Compositions of one must be flattened instead of exposed as their own entities

      // Compositions of one must be flattened instead of exposed as their own entities
      if (!comp.on) continue;

      if (!comp.on) continue;

      const entity = m.definitions[comp.target];
      const entityName = comp.target.split('.')[comp.target.split('.').length - 1]
      o.entities[comp.target] = o.dppServiceName + '.' + entityName
      let backLinkName = hasBacklink(entity.elements, fullName) ? backlink(entity.elements, fullName) : 'backlink';
      const newDsFields = { ...o.dsFields }
      const mixinFieldsToExclude = []

      const entityAlreadyExposed = !!m.definitions[o.dppServiceName + '.' + entityName];
      const newEntity = m.definitions[o.dppServiceName + '.' + entityName] ?? JSON.parse(JSON.stringify(entity));

      if (entityAlreadyExposed) {
        //If it is already exposed just check that annotations are given
        const dsIDField = _getDataSubjectIDField(newEntity.elements);
        if (!dsIDField) {
          LOG.error(`${entityName} has no field marked with @PersonalData.FieldSemantics : 'DataSubjectID'. Please expose the data subject ID!`)
        }
        if (!newEntity['@PersonalData.DataSubjectRole']) {
          LOG.error(`${entityName} is not annotated with @PersonalData.DataSubjectRole. Please add @PersonalData.DataSubjectRole!`)
        }
        if (!newEntity['@PersonalData.EntitySemantics']) {
          LOG.error(`${entityName} is not annotated with @PersonalData.EntitySemantics. Please add @PersonalData.EntitySemantics!`)
        }
      } else {
        if (newEntity.includes) delete newEntity.includes;
  
        function mixin() {
          const additionalFields = {}
  
          if (!hasBacklink(entity.elements, fullName)) {
            additionalFields[backLinkName] = {
              type: 'cds.Association',
              target: o.dppServiceName + '.' + parentName,
              cardinality: { max: 1 },
              on: compCondition(name, comp, backLinkName)
            }
          }
          if (o.redirectForParent) {
            additionalFields[backLinkName] = {
              type: 'cds.Association',
              target: o.dppServiceName + '.' + parentName,
              cardinality: { max: 1 },
              on: compCondition(backLinkName, entity.elements[backLinkName])
            }
          }
          if (o.redirectForParent) mixinFieldsToExclude.push(backLinkName)
          if (!hasBacklink(entity.elements, fullName)) { //In that case the children need to rewrite backlink and hence comp needs to be mixed in
            const children = Object.entries(entity.elements).filter(([, e]) => e.type === 'cds.Composition') //REVISIT: Possible problem if one hides the composition behind a custom type
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
          //Don't render foreign keys
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
          for (const field in o.dsFields) {
            if (fieldsFn[field](entity.elements)) {
              newDsFields[field] = fieldsFn[field](entity.elements)
            }
            //last check in case managed association is such a field already 
            else if (
              typeof o.dsFields[field] !== 'function' &&
              o.dsFields[field] &&
              !additionalFields.some(a =>
                a?.as === formatter(o.dsFields[field]).as ||
                (
                  a?.ref && a?.ref.join('.') === backLinkName &&
                  entity.elements[backLinkName] &&
                  entity.elements[backLinkName].keys.some(k => k.ref[0] === o.dsFields[field])
                )
              )
            ) {
              const newField = formatter(o.dsFields[field]);
              newEntity.elements[newField.as] = parentDefinition.elements[o.dsFields[field].replaceAll('.', '_')];
              additionalFields.push(newField);
              newDsFields[field] = !o.redirectForParent && entity.elements[backLinkName] ? `${backLinkName}.${o.dsFields[field]}` : `${backLinkName}_${o.dsFields[field]}`
            }
          }
          //Add keys to select for mixin
          if (o.redirectForParent && entity.elements[backLinkName] && entity.elements[backLinkName].keys) {
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

        if (o.assignInformationAnnotations) {
          if (!newEntity['@PersonalData.DataSubjectRole']) newEntity['@PersonalData.DataSubjectRole'] = parentDefinition['@PersonalData.DataSubjectRole']
          if (!newEntity['@PersonalData.EntitySemantics']) newEntity['@PersonalData.EntitySemantics'] = parentDefinition['@PersonalData.EntitySemantics']
          Object.assign(newEntity, assignInformationAnnotations(newEntity, newDsFields));
        }
        if (!o.exposeEntities) {
          newEntity['@cds.api.ignore'] = true;
          newEntity['@requires'] = 'InvalidRoleSoEntitiesCannotBeAccessedViaAPI';
        }
  
        result[o.dppServiceName + '.' + entityName] = newEntity;
      }

      //REVISIT - does not add deeper than 1 level as added backlinks cannot be referenced in deeper comps 
      Object.assign(result, exposeCompositionsWithRewrites(comp.target, newEntity, m, {dsFields: newDsFields, redirectForParent: !hasBacklink(entity.elements, fullName), entities: o.entities, dppServiceName: o.dppServiceName, assignInformationAnnotations: o.assignInformationAnnotations, exposeEntities: o.exposeEntities}));
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
  //TODO: Consider UI.Hidden or think about it, as those columns cannot be shown anyway - @PersonalData obviously would overrule, but in the other cases it would make sense
  if (!entity['@UI.LineItem']) {
    //Show key first
    //Than semantic keys
    //Than all other fields 
    const hasManaged = entity.includes && entity.includes.some(i => i === 'managed')
    const semanticKeys = entity['@Common.SemanticKey'] ? entity['@Common.SemanticKey'].map(m => m['=']) : []
    const asLineItem = (field) => ({ Value: { '=': field } })
    const lineItemElementMapping = ([field, element]) => {
      if (element.keys?.length) {
        //REVISIT: Arbitrary limitation that only first key values are taken over
        return asLineItem(field + '_' + element.keys[0].ref.join('_'))
      } else if (element.keys?.length === 0) {
        LOG.error(`${element.target} does not have any keys! Please add a primary key, which is needed for the data-privacy plugin!`)
        return asLineItem(field)
      } else {
        return asLineItem(field)
      }
    }
    //Only fields which are not yet added and possible (e.g. exclude associations/compositions without foreign key or which are to many) + sort after which contain personal data
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

module.exports = {
    assignInformationAnnotations,
    exposeCompositionsWithRewrites
}