const cds = require('@sap/cds');
const { getTranslationKey, mapCDStoDRMtype } = require('../lib/utils');
const LOG = cds.log('data-privacy-retention')

module.exports = class DPIRetentionService extends cds.ApplicationService {
  async init() {

    const { iLMObjects } = this.entities

    this.on('READ', iLMObjects, async req => {
      LOG.info(`cds.server.url upon calling iLMObjects: `, cds.server.url);
      const iLMObjects = Object.keys(this.definition.iLMObjects).map(iLMObject => {
        const entity = this.definition.iLMObjects[iLMObject];
        const selectionCriteria = getSelectionCriteria(entity);
        return {
          iLMObjectName: iLMObject,
          iLMObjectType: 'Transaction',
          iLMObjectDescription: cds.i18n.labels.for(getTranslationKey(entity['@Core.Description'])) || cds.i18n.labels.for(entity),
          iLMObjectDescriptionKey: getTranslationKey(entity['@Core.Description']) ?? undefined,
          iLMObjectBaseURL: buildBaseUrl(req),
          organizationAttributeName: entity.orgAttributeReference,
          referenceDates: (Object.entries(entity.elements)).reduce((acc, [name, value]) => {
            if (value['@PersonalData.FieldSemantics'] === 'EndOfBusinessDate' && value.type !== 'cds.Association' && value.type !== 'cds.Composition') {
              const startTime = {
                referenceDateName: name,
                referenceDateDescription: cds.i18n.labels.for(value),
                referenceDateDescriptionKey: undefined,
              }
              const descriptionI18nKey = cds.i18n.labels.key4(value)
              if (descriptionI18nKey) {
                startTime.referenceDateDescriptionKey = descriptionI18nKey;
              }
              acc.push(startTime)
            }
            return acc
          }, []),
          conditions: Object.keys(entity.elements).reduce((conditions, elementName) => {
            const element = entity.elements[elementName];
            if (element['@ILM.ValueHelp.Type'] === 'condition') {
              const condition = {
                conditionFieldName: elementName,
                conditionFieldType: mapCDStoDRMtype(element.type),
                conditionFieldDescription: cds.i18n.labels.for(element),
                conditionFieldDescriptionKey: undefined,
                conditionFieldValueHelpEndPoint: element['@ILM.ValueHelp.Path'],
              }
              const labelI18nKey = getTranslationKey(element["@Common.Label"]);
              if (labelI18nKey) {
                condition.conditionFieldDescriptionKey = labelI18nKey
              }
              conditions.push(condition);
            }
            return conditions;
          }, []),
          dataSubjectBlockingConfiguration: {
            dataSubjectEndOfBusinessEndPoint: `${this.path}/dataSubjectEndOfBusiness`,
            dataSubjectOrganizationAttributesEndPoint: entity.elements[entity.orgAttributeReference]['@ILM.ValueHelp.Path'],
            dataSubjectLastRetentionStartDatesEndPoint: `${this.path}/retentionStartDate`,
            dataSubjectsEndOfResidenceEndPoint: `${this.path}/dataSubjectsEndOfResidence`,
            dataSubjectsEndOfResidenceConfirmationEndPoint: `${this.path}/dataSubjectsEndOfResidenceConfirmation`,
            dataSubjectILMObjectBlockingEndPoint: `${this.path}/deleteILMObjectInstances`,
            dataSubjectsILMObjectDestroyingEndPoint: `${this.path}/destroyILMObjectInstances`,
          },
          destructionConfiguration: {
            iLMObjectDestructionEndPoint: `${this.path}/destruction`,
            iLMObjectDestructionSimulationEndPoint: `${this.path}/simulateDestruction`,
            selectionCriteria: selectionCriteria
          },
          dataSubjectRoles: entity['@PersonalData.DataSubjectRole']['=']?.enum ? Object.keys(entity.elements[entity['@PersonalData.DataSubjectRole']['=']].enum).map(ds => ({ dataSubjectRoleName: ds })) : [{ dataSubjectRoleName: entity['@PersonalData.DataSubjectRole'] }]
        }
      })
      LOG.debug('Transactional data discovery:', iLMObjects)
      req.reply(iLMObjects)
    })

    this.on('READ', this.entities['i18n-files'], async (req) => {
      const bundle = cds.i18n.bundle4(this.definition);
      const getFile = (language) => {
        let file = ''
        for (const key in bundle.defaults) {
          const translation = cds.i18n.labels.for(key, language);
          file += `${key}=${translation}\n`;
        };
        return file;
      }
      let file = ''
      if (req.data.file.startsWith('i18n_en')) {
        file = getFile('en');
      } else if (req.data.file.startsWith('i18n_de')) {
        file = getFile('de');
      } else if (req.data.file.startsWith('i18n_fr')) {
        file = getFile('fr');
      } else if (req.data.file.startsWith('i18n_es')) {
        file = getFile('es');
      } else {
        file = getFile('en');
      }
      req.res.set('Content-Type', 'text/plain');
      req.res.set('Content-disposition', `attachment; filename=${req.data.file ?? 'i18n.properties'}`);
      req.res.status(200);
      req.res.end(file);
    });

    /**
     * Validations for all DPI Retention actions
     */
    this.before('*', req => {

      if (req.data.applicationName && req.data.applicationName !== cds.env.requires['data-privacy-retention'].applicationName) {
        return req.error(400, 'Application name does not match the service application name.');
      }

      if (req.data.iLMObjectName && !this.entities[req.data.iLMObjectName]) {
        return req.error(400, `The ILM object ${req.data.iLMObjectName} does not exist!`);
      } else if (req.data.iLMObjectName && this.entities[req.data.iLMObjectName]) {
        req.data.iLMObject = this.entities[req.data.iLMObjectName]
      }
    })

  }
}

const buildBaseUrl = (req) => {
  let url = ''
  if (process.env.NODE_ENV === 'production') url += 'https://'
  url += req._req ? req._req.get('host') : req.req.get('host')
  return url
}

function getSelectionCriteria(entity) {
  return Object.keys(entity.elements).reduce((selectionCriteria, elementName) => {
    const element = entity.elements[elementName];
    if (element['@ILM.ValueHelp.Type'] === 'selection') {
      const type = mapCDStoDRMtype(element.type);
      const nextSelectionCriteria = {
        selectionCriteriaName: elementName,
        selectionCriteriaDisplayName: cds.i18n.labels.for(element),
        selectionCriteriaDisplayNameKey: undefined,
        selectionCriteriaDescription: undefined,
        selectionCriteriaDescriptionKey: undefined,
        selectionCriteriaType: type, //String, Integer, Decimal, Boolean, Timestamp
        isRangeEnabled: fieldIsAllowedForRange(elementName, type, entity),
        selectionCriteriaValueHelpEndPoint: type !== 'Boolean' && type !== 'String' && element['@ILM.ValueHelp.Path']
      }
      const labelI18nKey = getTranslationKey(element["@Common.Label"]);
      if (labelI18nKey) {
        nextSelectionCriteria.selectionCriteriaDisplayNameKey = labelI18nKey
      }
      if (element['@Core.Description']) {
        const descriptionI18nKey = getTranslationKey(element['@Core.Description']);
        selectionCriteria.selectionCriteriaDescription = cds.i18n.labels.for(descriptionI18nKey) ?? element['@Core.Description']
        if (descriptionI18nKey) {
          selectionCriteria.selectionCriteriaDescriptionKey = descriptionI18nKey;
        }
      }
      selectionCriteria.push(nextSelectionCriteria);
    }
    return selectionCriteria;
  }, [])
}

function fieldIsAllowedForRange(field, type, entity) {
  const filterExprRestriction = entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'] && entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'].some(restriction =>
    restriction.Property['='] === field && restriction.AllowedExpressions === 'SingleValue'
  ) //Range not allowed if there is a Filter Expression existing allowing only SingleValue
  const filterRangeWanted = entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'] && entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'].some(restriction =>
    restriction.Property['='] === field && restriction.AllowedExpressions === 'SingleRange'
  )
  return filterRangeWanted || (type !== 'String' && type !== 'Boolean' && !filterExprRestriction) //by default false - should be true when Integer, Decimal, Timestamp
}