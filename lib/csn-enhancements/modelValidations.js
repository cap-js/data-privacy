const cds = require('@sap/cds');
const LOG = cds._dpi.log('data-privacy');

/**
 * Validates the entity to ensure all necessary fields are given for the data privacy integration to work
 * @param {string} entityName CSN entity name  
 * @param {*} m CSN
 */
function entityValidation(entityName, m) {
    const entity = m.definitions[entityName];
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
}

module.exports = {
    entityValidation
}