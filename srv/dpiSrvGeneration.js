const cds = require('@sap/cds'), fs = require("fs"), path = require("path"), fullDPIService = require('./fullDPIDefinitions')

const _getDataSubjectIDField = (elements) => _getField(elements, 'DataSubjectID')
const _getLegalEntityIDField = (elements) => _getField(elements, 'LegalEntityID')
const _getEndOfBusinessDateField = (elements) => _getField(elements, 'EndOfBusinessDate')

const _getField = (elements, name) => {
    for (const element in elements) {
        if (elements[element] && elements[element]['@PersonalData.FieldSemantics'] === name)
            return element
    }
}

const concatArr = (arr, div = '.') => arr.reduce((acc, val) => acc.length === 0 ? acc += val : acc += `${div}${val}`,'')
const hasBacklink = (elements, parent) => Object.values(elements).some(e => e.target && e.target === parent)
const backlink = (elements, parent) => Object.entries(elements).find(([n,e]) => e.target && e.target === parent)[0]
const gCompsToOne = elements => Object.entries(elements).filter(([n, e]) => e.type === 'cds.Composition' && e.cardinality && e.cardinality.max === 1) //REVISIT: Is possible issue for compositions hidden behind a custom type
const fieldsFn = {
  legalID:  _getLegalEntityIDField,
  dsID: _getDataSubjectIDField,
  eob: _getEndOfBusinessDateField
}
const compCondition = (name, cmp, backLinkName) => {
  if (cmp.on)
    return backLinkName ? JSON.parse(JSON.stringify(cmp.on)).reduce((acc, val) => {
        if (Array.isArray(val.ref)) {
            if (val.ref[0] === name) val.ref.shift()
            else val.ref = [backLinkName, ...val.ref]
            acc += concatArr(val.ref)
        } else if (val.val) acc += val.val
        else acc += val
        return acc
    }, '') : cmp.on.reduce((acc,val) => {
      if (Array.isArray(val.ref)) {
        acc += concatArr(val.ref)
      } else if (val.val) acc += val.val
      else acc += val
      return acc
    }, '')
  if (cmp.keys)
      return JSON.parse(JSON.stringify(cmp.keys)).reduce((acc, val) => {
          if (acc.length > 0) acc += ' and '
          acc += `${name}.${val.ref[0]} = $self.${name}_${val.ref[0]}`
          return acc
      }, '')
}
const addCompositions = (fullName, def, dsFields, m, namespaceString, redirectForParent = false, DRMEntities) => {
  let result = ''
  const compositons = Object.entries(def.elements).filter(([n, e]) => e.type === 'cds.Composition') //REVISIT: Possible problem if one hides the compositon behind a custom type
  if (compositons.length > 0) {
    const entityName = fullName.split('.')[fullName.split('.').length-1]
    const semanticKeys = def['@Common.SemanticKey'] ? def['@Common.SemanticKey'].map(m => m['=']) : []
    for (const [name, comp] of compositons) {
      DRMEntities[comp.target] = 1 //Ensures that entities are not tracked twice
      const entity = m.definitions[comp.target], eName = comp.target
      let shortName = eName.split('.')[eName.split('.').length-1],
        nspace = eName.substring(0,eName.length-1-shortName.length),
        target = `${namespaceString(nspace, def)}.${shortName}`,
        backLinkName = hasBacklink(entity.elements, fullName) ? backlink(entity.elements, fullName) : 'backlink' 
      const newDsFields = {...dsFields}
      const mixinFieldsToExclude = []
      const mixin = () => {
        const additionalFields = []

        if (!hasBacklink(entity.elements, fullName))
            additionalFields.push(`${backLinkName}: Association to one ${entityName} on ${compCondition(name, comp, backLinkName)}`)
        if (redirectForParent)
            additionalFields.push(`${backLinkName}: Association to one ${entityName} on ${compCondition(backLinkName, entity.elements[backLinkName])}`)
        if (redirectForParent) mixinFieldsToExclude.push(backLinkName)
        const isOne = (child) => child.cardinality && child.cardinality.max == '1' ? 'one' : ''
        if (!hasBacklink(entity.elements, fullName)) { //In that case the childs need to rewrite backlink and hence comp needs to be mixed in
            const children = Object.entries(entity.elements).filter(([n,e]) => e.type === 'cds.Composition') //REVISIT: Possible problem if one hides the compositon behind a custom type
            for (const [cname, child] of children) {
                mixinFieldsToExclude.push(cname)
                const childName = child.target.split('.')[child.target.split('.').length-1]
                additionalFields.push(`${cname}: Composition of ${isOne(child)} ${childName} on ${compCondition(cname, child)}`)
            }
        }
        return concatArr(additionalFields,';')
      }
      const columns = () => {
        let additionalFields = ['*', backLinkName], formatter = (f) => `${backLinkName}.${f} as ${backLinkName}_${f}`
        //additionalFields.push(`${backLinkName}: redirected to ${entityName}`)
        //Add keys and semantic keys - label ID keys as "<entity> ID"
        //Dont render foreign keys
        additionalFields.push(...Object.entries(def.elements).filter(([n ,e]) => e.key && !entity.elements[`${backLinkName}_${n}`] && !comp.on.some(o => o.ref && o.ref[0] === n) && (!entity.elements[backLinkName] || !entity.elements[backLinkName].keys.some(k => k.ref[0] === n))).map(([n]) => {let r = formatter(n); if(n === 'ID') r+= ` @(title : '${entityName} ID')`;return r;}) ) 
        additionalFields.push(...semanticKeys.map(n => formatter(n)))
        //Add privacy related fields
        for (const field in dsFields) {
          if (fieldsFn[field](entity.elements)) {
            newDsFields[field] = fieldsFn[field](entity.elements)
          } else if(typeof dsFields[field] !== 'function' && dsFields[field]) {
            additionalFields.push(formatter(dsFields[field]))
            newDsFields[field] = `${backLinkName}_${dsFields[field]}`
          } 
        }
        //Add keys to select for mixin
        if (redirectForParent && entity.elements[backLinkName] && entity.elements[backLinkName].keys) {
            entity.elements[backLinkName].keys.forEach(k => {
                const f = formatter(k.ref[0])
                if (!additionalFields.some(a => a === f)) additionalFields.push(f)
            })
        }
        //Add to exclude fields if not already present, to ensure that mixed in fields are used
        mixinFieldsToExclude.forEach(f => {
            if (!additionalFields.some(a => a === f)) additionalFields.push(f)
        })
        additionalFields = concatArr(additionalFields,',')
        return additionalFields
      }
      const excluding = () => mixinFieldsToExclude.length > 0 ? `excluding {${concatArr(mixinFieldsToExclude,',')}}` : ''

      if(!entity['@PersonalData.DataSubjectRole']) entity['@PersonalData.DataSubjectRole'] = def['@PersonalData.DataSubjectRole']
      if(!entity['@PersonalData.EntitySemantics']) entity['@PersonalData.EntitySemantics'] = def['@PersonalData.EntitySemantics']

        result += `${annotations(entity, newDsFields)} `+
            `entity ${shortName} as select from ${target} mixin {${mixin()}} into {${columns()}} ${excluding()};`
        result += addCompositions(comp.target, entity, newDsFields, m, namespaceString, !hasBacklink(entity.elements, fullName), DRMEntities) //REVISIT - does not add deeper than 1 level as added backlinks cannot be referenced in deeper comps 
    }
  }
  return result
}

const managedFields = {createdBy: 1, createdAt: 1, modifiedBy: 1, modifiedAt: 1}

function annotations(entity, dsFields) {
  let result = `@(
    PersonalData.DataSubjectRole : '${entity['@PersonalData.DataSubjectRole']}',
    PersonalData.EntitySemantics : '${entity['@PersonalData.EntitySemantics']}')`

  if (!entity['@UI.LineItem']) {
    //Show key first
    //Than semantic keys
    //Than end of business
    //Than all other fields 
    const hasManaged = entity.includes && entity.includes.some(i => i === 'managed')
    const semanticKeys = entity['@Common.SemanticKey'] ? entity['@Common.SemanticKey'].map(m => m['=']) : []
    const asLineItem = (field) => ({Value: {'=': field}})
    const lineItemElementMapping = ([field, element]) => {
      if(element.keys) {
        //REVISIT: Arbitrary limitation that only first key values are taken over
        return asLineItem(field+'_'+concatArr(element.keys[0].ref,'_'))
      } else return asLineItem(field)
    }
    //Only fields which are not yet added and possible (e.g. exclude assocs/comps without foreign key or which are to many) + sort after which contain personal data
    const otherFields = Object.entries(entity.elements).filter(([n, e]) => 
      !e.key && 
      (!(e.type === 'cds.Association' || e.type === 'cds.Composition' || (!e.keys && e.on)) || e.keys) && 
      n !== dsFields.eob && !semanticKeys.some(s => s === n)
    ).sort(([f1,e1],[f2,e2]) => {
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
        otherFields.push(...otherFields.splice(index,1))
      }
    }
    entity['@UI.LineItem'] = [
      ...Object.entries(entity.elements).filter(([n, e]) => e.key).map(lineItemElementMapping),
      ...semanticKeys.map(m => asLineItem(m)),
      ...(dsFields.eob !== null && typeof dsFields.eob !== 'function' ? [asLineItem(dsFields.eob)] : []),
      ...otherFields.map(lineItemElementMapping)
    ]
  }
  result += `@UI.LineItem : [${entity['@UI.LineItem'].reduce((acc, val) => {
    acc += `{Value: ${val.Value['=']}},`
    return acc
  }, '')}]`

  if (!Object.keys(entity).some(k => k.startsWith('@UI.FieldGroup'))) {
    entity['@UI.FieldGroup#CAP_DPI_GENERATED.Label'] = entity['@Core.Description'] 
      || entity['@description'] 
      || (entity['@PersonalData.EntitySemantics'] === 'DataSubjectDetails'?'Data subject details':'Details') //REVISIT - make last one translatable
    entity['@UI.FieldGroup#CAP_DPI_GENERATED.Data'] = entity['@UI.LineItem']
    result += `@UI.FieldGroup #CAP_DPI_GENERATED : {Label: '${entity['@UI.FieldGroup#CAP_DPI_GENERATED.Label']}', Data: [${entity['@UI.LineItem'].reduce((acc, val) => {
      acc += `{Value: ${val.Value['=']}},`
      return acc
    }, '')}]}`
  }
  
  return result
}

module.exports = function dpiServiceGeneration() {
    let DRMServiceLoaded = false, PDMServiceLoaded = false
    const DRMEntities = {}
    return async m => {
        if (DRMServiceLoaded) return
        let drmServiceString = `service DRMService {`, importString = '', pdmServiceString = `service PDMService {`
        const namespaces = {}
        const namespaceString = (namespace, entity) => {
            if (namespaces[namespace]) return namespaces[namespace]
            namespaces[namespace] = `import${Object.entries(namespaces).length}`
            importString += `using { ${namespace} as ${namespaces[namespace]} } from '${entity.$location.file}';`;
            return namespaces[namespace]
        } 
        for (let each in m.definitions) {
            let def = m.definitions[each]
            if (
                def.kind === 'service' && 
                !def['@cds.provided'] && (each === 'DRMService' || (def['@path'] && (def['@path'] === '/drm' || def['@path'] === 'drm')))
            )
                DRMServiceLoaded = true
            if (
                def.kind === 'service' && 
                !def['@cds.provided'] && (each === 'PDMService' || (def['@path'] && (def['@path'] === '/pdm' || def['@path'] === 'pdm')))
            )
                PDMServiceLoaded = true
            //add entities to drm
            //REVISIT - projections are common of external entities - check if that is really fine
            if (!def.query && !def.projection && def.kind === 'entity' && def['@PersonalData.EntitySemantics'] && !(each in DRMEntities)) {
              DRMEntities[each] = 1
                //Skip datasubject details if they are a composition of data subject
                if (
                def['@PersonalData.EntitySemantics'] === 'DataSubjectDetails' && 
                Object.values(def.elements).some(e => 
                    e.target && 
                    m.definitions[e.target]['@PersonalData.EntitySemantics'] === 'DataSubject' && 
                    Object.values(m.definitions[e.target].elements).some(ee => ee.target && ee.target === each)
                )
                ) continue;
                const entityName = each.split('.')[each.split('.').length-1]
                const namespace = each.substring(0,each.length-1-entityName.length)
                drmServiceString += `entity ${entityName} as projection on ${namespaceString(namespace, def)}.${entityName};`

                //add all composition entities to PDM too 
                //if composition entity has backlink use that to also show parent keys & semantic keys - 
                //in case of parent key is ID - prefix label with parent name
                //If composition entity has no backlink than create projection out of service just to get backlink
                //Add DataSubjectID, LegalEntityID and EndOfBusinessDate fields from parent - from root view also have a look at comps to one and resolve if those contain the fields
                const fields = {
                legalID: _getLegalEntityIDField(def.elements) || _getLegalEntityIDField,
                dsID: _getDataSubjectIDField(def.elements) || _getDataSubjectIDField,
                eob: _getEndOfBusinessDateField(def.elements) || _getEndOfBusinessDateField
                }
                const searchInCompForField = (def, fn) => {
                const compsToOne = gCompsToOne(def.elements)
                for (const [n, c] of compsToOne) {
                    const ce = m.definitions[c.target]
                    if (fn(ce.elements)) return concatArr([n, fn(ce.elements)])
                    const r = searchInCompForField(ce, fn)
                    if (r) return concatArr([n, r]);
                }
                return null
                }
                const ensureDPrelatedFieldsOnRoot = () => {
                let additionalFields = ['*']
                for (const field in fields) {
                    if (typeof fields[field] === 'function') {
                    fields[field] = searchInCompForField(def, fields[field])
                    if (fields[field]) additionalFields.push(`${concatArr(fields[field].split('.'))} as ${concatArr(fields[field].split('.'),'_')}`)
                    }
                }
                additionalFields = concatArr(additionalFields,',')
                return additionalFields.length > 1 ? `{${additionalFields}}` : ''
                }
                pdmServiceString += `${annotations(def, fields)} entity ${entityName} as projection on ${namespaceString(namespace, def)}.${entityName}${ensureDPrelatedFieldsOnRoot()};`
                pdmServiceString += addCompositions(each, def, fields, m, namespaceString, undefined, DRMEntities)
            }
        }
        drmServiceString += '};' //Closing service def
        pdmServiceString += '};' //Closing service def

        //Scenario 1 - DRM & PDM adds delta - everything that should be there but is not
        const dpiModel = cds.compile(
        {'*': m, 'drm-service.cds': importString + drmServiceString, 'pdm-service.cds': importString + pdmServiceString}, 
        {silent: true}
        )
        dpiModel.definitions.DRMService = fullDPIService.DRMService;
        dpiModel.definitions.DRMService['@impl'] = path.join(__dirname, './drm-service.js')
        dpiModel.definitions.PDMService = fullDPIService.PDMService;
        for (const each in dpiModel.definitions) {
            if ((each.startsWith('DRMService') || each.startsWith('PDMService')) && !m.definitions[each]) {
                Object.assign(m.definitions, {[each]: dpiModel.definitions[each]})
            }
        }
        return m
    }
}