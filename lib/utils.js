const cds = require('@sap/cds');

const whereForConditionSet = (conditions) => {
    let where = []
    conditions.forEach((e, idx) => {
        if (idx !== 0) where.push('and')
        where.push(
            {ref: [e.conditionFieldName]},
            '=',
            {val: e.conditionFieldValue}
        )
    })
    return where
}


const _getDataSubjectIDField = (elements) => _getField(elements, 'DataSubjectID')
const _getLegalEntityIDField = (elements) => _getField(elements, 'DataControllerID')
const _getEndOfBusinessDateField = (elements) => _getField(elements, 'EndOfBusinessDate')

function getOrgAttributes(elements) {
    const orgAttributes = [];
    for (const element in elements) {
        if (elements[element] && elements[element]['@PersonalData.FieldSemantics'] === 'DataControllerID' && (elements[element].isAssociation || elements[element].type === 'cds.Association')) {
            orgAttributes.push(elements[element]);
        }
    }
    return orgAttributes;
}

const _getField = (elements, name) => {
    for (const element in elements) {
        if (elements[element] && elements[element]['@PersonalData.FieldSemantics'] === name && !elements[element].isAssociation)
            return element
    }
}

const _buildWhereClauseForDS = (entity, dsID, role) => {
    const dataSubjectIDField = entity.dataSubjectIdReference
    const where = [
        {ref: [dataSubjectIDField]},
        '=',
        {val: dsID}
    ]
    if (entity['@PersonalData.DataSubjectRole']?.['=']) {
        where.push(
            'and',
            {ref: entity['@PersonalData.DataSubjectRole']['=']},
            '=',
            {val: role}
        )
    }
    return where
}

const _buildWhereClauseForDSsArr = (entity, dsIDs) => {
    const dataSubjectIDField = entity.dataSubjectIdReference
    return [
        {ref: [dataSubjectIDField]},
        'in',
        {list: dsIDs.map(d => ({val: d}))}
    ]
}

const _getRoot = (entity) =>  {
    if (!entity.query)
      return entity
    else 
      return _getRoot(entity.query._target)
}

const translationUtils = (model, o = {}) => {
    const no_translations = cds.env.i18n.languages === 'none'
    const standard_locale = cds.env.i18n.fallback_bundle || cds.env.i18n.default_language
    const getI18n = () => {
        if (o.isBuild) {
            const { ResourceManager } = require("@sap/textbundle");
            const TextResourceManager = new ResourceManager('/_i18n/i18n');
            return TextResourceManager.getTextBundle(standard_locale); // e.g. en_us
        }
        return cds.localize.bundle4(model, standard_locale)
    } 
    const i18nBundle = getI18n()
      //value of annotations with i18n is complete key
      //if they are provided manual translation required so that the properties in the entity have the default_language values
    const getTranslationKey = (value) => {
        if (typeof value !== 'string') return undefined
      const result = value.match(/(?<=\{@?(i18n>)).*(?=\})/g) //REVISIT, what is allowed for i18n as key?
      return result && !no_translations ? result[0] : undefined
    }
    /**
     * Translates a given annotation text value
     * Returns the value if no i18n key was found,
     * If one was found but no translation exists the key is returned
     * else the translation is returned 
     */
    const translate = (value) => {
        if (typeof value !== 'string') return value 
      const result = value.match(/(?<=\{@?(i18n>)).*(?=\})/g) //REVISIT, what is allowed for i18n as key?
      if (!result) return value
      if (o.isBuild) {
        return i18nBundle.getText(result[0])
      }
      else if (i18nBundle[result[0]]) return i18nBundle[result[0]]
      else return result[0]
    }
    return {
        getTranslationKey,
        translate,
        no_translations
    }
}

module.exports = {
    _getDataSubjectIDField,
    _getLegalEntityIDField,
    _getEndOfBusinessDateField,
    _buildWhereClauseForDS,
    whereForConditionSet,
    translationUtils,
    _buildWhereClauseForDSsArr,
    _getRoot,
    getOrgAttributes
}