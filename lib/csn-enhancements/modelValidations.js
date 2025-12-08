const cds = require('@sap/cds');
const LOG = cds._dpi.log('data-privacy');

/**
 * Validates the entity to ensure all necessary fields are given for the data privacy integration to work
 * @param {string} entityName CSN entity name  
 * @param {*} m CSN
 */
function entityValidation(entityName, m) {
  const entity = m.definitions[entityName];
  if (entity.query || entity.projection) return;

  // Ensure EntitySemantics and DataSubjectRole are always both annotated and cannot exists without each other
  if (entity['@PersonalData.EntitySemantics'] && !entity['@PersonalData.DataSubjectRole']) {
    LOG.error(`${entityName} is annotated with @PersonalData.EntitySemantics but is lacking the @PersonalData.DataSubjectRole annotation!`)
  } else if (!entity['@PersonalData.EntitySemantics'] && entity['@PersonalData.DataSubjectRole']) {
    LOG.error(`${entityName} is annotated with @PersonalData.DataSubjectRole but is lacking the @PersonalData.EntitySemantics annotation!`)
  }

  // Ensure that the dynamic data subject role can be resolved
  if (typeof entity['@PersonalData.DataSubjectRole'] !== 'string') {
    if (entity['@PersonalData.DataSubjectRole']?.['=']) {
      const segments = entity['@PersonalData.DataSubjectRole']['='].split('.')
      let currentEntity = entityName;
      let currentElement = null;
      for (const segment of segments) {
        currentElement = m.definitions[currentEntity].elements[segment]
        if (!currentElement) {
          LOG.error(`Cannot resolve the @PersonalData.DataSubjectRole path "${entity['@PersonalData.DataSubjectRole']['=']}" of ${entityName}. Cannot find ${segment} in ${currentEntity}!`)
          break;
        } else if (currentElement.cardinality?.max === '*') {
          LOG.error(`Cannot resolve the @PersonalData.DataSubjectRole path "${entity['@PersonalData.DataSubjectRole']['=']}" of ${entityName}. "${segment}" is a to many relation, which cannot be used!`)
          break;
        }
        currentEntity = currentElement.target
      }
      if (!currentElement) {
        LOG.error(`Cannot resolve the @PersonalData.DataSubjectRole path "${entity['@PersonalData.DataSubjectRole']['=']}" of ${entityName}.`)
      } else if (!resolveCustomElementType(currentElement, m).enum) {
        LOG.error(`The @PersonalData.DataSubjectRole path "${entity['@PersonalData.DataSubjectRole']['=']}" of ${entityName} does not point to an enum property. Dynamic role properties must have an enum assigned detailing all possible roles!`)
      }
    } else {
      LOG.error(`Cannot resolve the @PersonalData.DataSubjectRole of ${entityName}. Please use a path to a property or a static string value. Expressions are not allowed!`)
    }
  }

  if (entity['@PersonalData.EntitySemantics'] === 'DataSubject') {
    for (const k in entity.elements) {
      const element = resolveCustomElementType(entity.elements[k], m)
      if (
        element.type === 'cds.Composition' &&
        m.definitions[element.target]?.['@PersonalData.EntitySemantics'] !== 'DataSubjectDetails'
      ) {
        LOG.warn(`The composition ${k} of the data subject ${entityName} points to ${element.target}. However ${element.target} is not annotated with '@PersonalData.EntitySemantics': 'DataSubjectDetails'.`)
      }
    }
  }

  if (entity['@PersonalData.EntitySemantics'] === 'Other') {
    if (!Object.keys(entity.elements).some(e => entity.elements[e]['@PersonalData.FieldSemantics'] === 'EndOfBusinessDate')) {
      LOG.error(`${entityName} is lacking a property annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate'. This is necessary to determine from when on the entity must be blocked and later destructed.`)
    }

    const dsIDProperties = Object.keys(entity.elements).filter(e => entity.elements[e]['@PersonalData.FieldSemantics'] === 'DataSubjectID')
    if (!dsIDProperties.length) {
      LOG.error(`${entityName} is lacking a property annotated with @PersonalData.FieldSemantics : 'DataSubjectID'. This is necessary to determine to which data subject the records belong.`)
    }
    if (dsIDProperties.length > 1) {
      LOG.error(`${entityName} is has multiple properties annotated with @PersonalData.FieldSemantics : 'DataSubjectID'. Only one is allowed! This is necessary to correctly determine to which data subject the records belong.`)
    }
  }
  for (const k in entity.elements) {

    // 1. Ensure there is no semantic annotation overlap on any property, which would be an ambiguous model
    if (Object.keys(entity.elements[k]).filter(k => k.startsWith('@PersonalData.FieldSemantics')).length > 1) {
      LOG.error(`${k} of ${entityName} has multiple @PersonalData.FieldSemantics annotations. Only one is allowed!`)
    }
    if (entity.elements[k]['@PersonalData.FieldSemantics'] !== 'DataControllerID' && entity.elements[k]['@ILM.FieldSemantics'] === 'LineOrganizationAttribute') {
      LOG.error(`${k} of ${entityName} is annotated with @ILM.FieldSemantics : 'LineOrganizationAttribute' but also a conflicting @PersonalData.FieldSemantics annotation! Please remove either of them!`)
    }
    if (entity.elements[k]['@PersonalData.FieldSemantics'] !== 'PurposeID' && entity.elements[k]['@ILM.FieldSemantics'] === 'ProcessOrganizationAttribute') {
      LOG.error(`${k} of ${entityName} is annotated with @ILM.FieldSemantics : 'ProcessOrganizationAttribute' but also a conflicting @PersonalData.FieldSemantics annotation! Please remove either of them!`)
    }

    // 2. Ensure data types are as expected
    if (entity.elements[k]['@PersonalData.FieldSemantics'] in fieldRequiringDateType && !(resolveCustomType(entity.elements[k].type, m) in dateTypes)) {
      LOG.error(`${k} of ${entityName} is annotated with @PersonalData.FieldSemantics : '${entity.elements[k]['@PersonalData.FieldSemantics']}' but the data type (${resolveCustomType(entity.elements[k].type, m)}) does not match one of the required data types: ${Object.keys(dateTypes).join(', ')}`)
    }
    if (
      entity.elements[k]['@PersonalData.FieldSemantics'] in personalDataFieldsForReference && resolveCustomType(entity.elements[k].type, m) in unsupportedDataTypesForFieldReferences
    ) {
      LOG.error(`The data type (${resolveCustomType(entity.elements[k].type, m)}) of ${k} of ${entityName} is not supported for @PersonalData.FieldSemantics : '${entity.elements[k]['@PersonalData.FieldSemantics']}'! Unsupported data types: ${Object.keys(unsupportedDataTypesForFieldReferences).join(', ')}`)
    }
    if (
      entity.elements[k]['@ILM.FieldSemantics'] in ilmFieldsForReference && resolveCustomType(entity.elements[k].type, m) in unsupportedDataTypesForFieldReferences
    ) {
      LOG.error(`The data type (${resolveCustomType(entity.elements[k].type, m)}) of ${k} of ${entityName} is not supported for @ILM.FieldSemantics : '${entity.elements[k]['@ILM.FieldSemantics']}'! Unsupported data types: ${Object.keys(unsupportedDataTypesForFieldReferences).join(', ')}`)
    }

    // REVISIT: This check only exists because cap-js/audit-logging auto-marks entities with EntitySemantics = 'Other' when they have an association to a DataSubject
    if (entity.elements[k].type === 'cds.Association' || entity.elements[k].type === 'cds.Composition') {
      if (
        m.definitions[entity.elements[k].target]?.['@PersonalData.EntitySemantics'] === 'DataSubject' &&
        !entity['@PersonalData.EntitySemantics']
      ) {
        LOG.error(`${entityName} has an association "${k}" to a data subject ${entity.elements[k].target} but is not marked as transactional data!`)
      }
    }
  }
}

const fieldRequiringDateType = {'EndOfBusinessDate': 1, 'EndOfRetentionDate': 1, 'BlockingDate': 1}
const dateTypes = {'cds.Date': 1, 'cds.DateTime': 1, 'cds.Timestamp': 1}

const personalDataFieldsForReference = {'DataSubjectID': 1, 'PurposeID': 1, 'DataControllerID': 1}
const ilmFieldsForReference = {'LineOrganizationAttribute': 1, 'ProcessOrganizationAttribute': 1}
const unsupportedDataTypesForFieldReferences = {'cds.LargeBinary': 1, 'cds.Binary': 1, 'cds.Date': 1, 'cds.DateTime': 1, 'cds.Timestamp': 1, 'cds.Map': 1, 'cds.LargeString': 1}

function resolveCustomType(type, model) {
  if (model.definitions[type]) {
    return resolveCustomType(model.definitions[type].type, model)
  }
  return type;
}

function resolveCustomElementType(element, model) {
  if (model.definitions[element.type]) {
    return resolveCustomElementType(model.definitions[element.type], model)
  }
  return element;
}

module.exports = {
  entityValidation
}