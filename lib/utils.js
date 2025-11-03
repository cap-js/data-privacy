const cds = require('@sap/cds');

const whereForConditionSet = (conditions) => {
  let where = []
  conditions.forEach((e, idx) => {
    if (idx !== 0) where.push('and')
    where.push(
      { ref: [e.conditionFieldName] },
      '=',
      { val: e.conditionFieldValue }
    )
  })
  return where
}


const _getDataSubjectIDField = (elements) => _getField(elements, 'DataSubjectID')
const _getOrgAttributeIDField = (elements) => {
  for (const element in elements) {
    if (elements[element] && (elements[element]['@PersonalData.FieldSemantics'] === 'DataControllerID' || elements[element]['@ILM.FieldSemantics'] === 'LineOrganizationAttribute') && !elements[element].isAssociation)
      return element
  }
}
const _getEndOfBusinessDateField = (elements) => _getField(elements, 'EndOfBusinessDate')

const _getField = (elements, name) => {
  for (const element in elements) {
    if (elements[element] && elements[element]['@PersonalData.FieldSemantics'] === name && !elements[element].isAssociation)
      return element
  }
}

const _buildWhereClauseForDS = (entity, dsID, role) => {
  const where = [
    { ref: [entity.dataSubjectIdReference] },
    '=',
    { val: dsID }
  ]
  if (entity['@PersonalData.DataSubjectRole']?.['=']) {
    where.push(
      'and',
      { ref: entity['@PersonalData.DataSubjectRole']['='] },
      '=',
      { val: role }
    )
  }
  return where
}

const _getRoot = (entity) => {
  if (entity.query) {
    return _getRoot(entity.query._target)
  } else if (entity.projection) {
    return _getRoot(entity.projection._target)
  }
  return entity
}

const getTranslationKey = (value) => {
  if (typeof value !== 'string') return undefined
  const result = value.match(/{i18n>(.+)}/)?.[1]
  return result && cds.env.i18n.languages !== 'none' ? result : undefined
}

function mapCDStoDRMtype(type) {
  switch (type) {
    case 'cds.UUID':
    case 'cds.String':
      return 'String'
    case 'cds.Integer':
    case 'cds.UInt8':
    case 'cds.Int16':
    case 'cds.Int32':
    case 'cds.Int64':
    case 'cds.Integer64':
      return 'Integer'
    case 'cds.Decimal':
    case 'cds.Double':
      return 'Decimal'
    case 'cds.Boolean':
      return 'Boolean'
    case 'cds.Timestamp':
    case 'cds.Date':
    case 'cds.DateTime':
      return 'Timestamp'
    default:
      return null
  }
}

module.exports = {
  mapCDStoDRMtype,
  _getDataSubjectIDField,
  _getOrgAttributeIDField,
  _getEndOfBusinessDateField,
  _buildWhereClauseForDS,
  whereForConditionSet,
  getTranslationKey,
  _getRoot
}