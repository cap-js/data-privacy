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
const gCompsToOne = elements => Object.entries(elements).filter(([n, e]) => e.type === 'cds.Composition' && e.cardinality && e.cardinality.max === 1)
const fieldsFn = {
  legalID:  _getLegalEntityIDField,
  dsID: _getDataSubjectIDField,
  eob: _getEndOfBusinessDateField
}
const addCompositions = (fullName, def, dsFields, m, namespaceString, redirectForParent = false) => {
  let result = ''
  const compositons = Object.entries(def.elements).filter(([n, e]) => e.type === 'cds.Composition')
  if (compositons.length > 0) {
    const entityName = fullName.split('.')[fullName.split('.').length-1]
    const semanticKeys = def['@Common.SemanticKey'] ? def['@Common.SemanticKey'].map(m => m['=']) : []
    for (const [name, comp] of compositons) {
      const entity = m.definitions[comp.target], eName = comp.target
      let shortName = eName.split('.')[eName.split('.').length-1],
        nspace = eName.substring(0,eName.length-1-shortName.length),
        target = `${namespaceString(nspace, def)}.${shortName}`,
        backLinkName = hasBacklink(entity.elements, fullName) ? backlink(entity.elements, fullName) : 'backlink' 
      if (!hasBacklink(entity.elements, fullName) || redirectForParent) {
        //Use on condition from root and fit it to child
        const additionalFields = []
        const compCondition = () => JSON.parse(JSON.stringify(comp.on)).reduce((acc, val) => {
          if (Array.isArray(val.ref)) {
            if (val.ref[0] === name) val.ref.shift()
            else val.ref = [backLinkName, ...val.ref]
            acc += concatArr(val.ref)
          } else if (val.val) acc += val.val
          else acc += val
          return acc
        }, '')
        if (!hasBacklink(entity.elements, fullName))
            additionalFields.push(`${backLinkName}: Association to one ${entityName} on ${compCondition()}`)
        if (redirectForParent)
            additionalFields.push(`${backLinkName}: redirected to ${entityName}`)
        const newTarget = `${shortName}_wBackLink`
        result += `entity ${newTarget} as projection on ${target} {*,${concatArr(additionalFields,',')}};`
        target = newTarget
    }
      const newDsFields = {...dsFields}
      const ensureDPrelatedFieldsOnChild = () => {
        let additionalFields = ['*'], formatter = (f) => `${backLinkName}.${f} as ${backLinkName}_${f}`
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
        additionalFields = concatArr(additionalFields,',')
        return additionalFields.length > 0 ? `{${additionalFields}}` : additionalFields
      }
      result += `entity ${shortName} as projection on ${target}${ensureDPrelatedFieldsOnChild()};`
      result += addCompositions(comp.target, entity, newDsFields, m, namespaceString, !hasBacklink(entity.elements, fullName)) //REVISIT - does not add deeper than 1 level as added backlinks cannot be referenced in deeper comps 
    }
  }
  return result
}

module.exports = function dpiServiceGeneration() {
    let DRMServiceLoaded = false, PDMServiceLoaded = false
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
            if (!def.query && !def.projection && def.kind === 'entity' && def['@PersonalData.EntitySemantics']) {
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
                pdmServiceString += `entity ${entityName} as projection on ${namespaceString(namespace, def)}.${entityName}${ensureDPrelatedFieldsOnRoot()};`
                pdmServiceString += addCompositions(each, def, fields, m, namespaceString)
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