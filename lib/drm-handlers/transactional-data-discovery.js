const { translationUtils } = require('../utils')

const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('drm')

const conditionEntity = {
  kind: "entity",
  "@readonly": true,
  elements: {
    value: {
      key: true,
      type: "cds.String",
    },
    valueDesc: {
      type: "cds.String",
    },
  },
  "@Capabilities.DeleteRestrictions.Deletable": false,
  "@Capabilities.InsertRestrictions.Insertable": false,
  "@Capabilities.UpdateRestrictions.Updatable": false,
}

/**
 * 
 * @param {*} srv 
 * @param {*} db 
 * @param {Boolean} o.registerVH Only register value helps 
 */
function serveLegalGrounds(srv, o) {
    if (o.registerVH && srv.definitions) {
      srv.entities = srv.definitions
      srv.model = srv.definitions
    }
    const {legalGrounds} = srv.entities     
    const { translate, getTranslationKey } = translationUtils(srv.model)

    //Legal grounds which are served to drm are saved in memory for improved performance
    const servicePath = srv.path
    if (!cds.env.requires.drm) cds.env.requires.drm = {}
    cds.env.requires.drm.legalGroundPerDataSubject = {} //Get Data Subject for a legal ground and add them to map with legal grounds - goal is to provide specific endpoints for each role
    const nameOf = (entity, eName) => entity.name ? entity.name.split('.')[entity.name.split('.').length-1] : eName.split('.')[eName.split('.').length-1]
    for(const [eName, entity] of Object.entries(srv.entities)) {
      if (/* !entity._service && !entity.projection && !entity.select &&  */entity['@PersonalData.EntitySemantics'] === 'Other' && entity['@cds.drm.rootEntity']) {
        const selectionCriteria = buildSelectionCriteriaForLegalGround(nameOf(entity, eName), entity.elements, entity)
        const legalGround = {
          legalGround: nameOf(entity, eName),
          legalGroundDescription: translate(entity['@Core.Description']) || nameOf(entity, eName),
          //legalGroundDescriptionKey: nameOf(entity), //Whats the difference // name <-- caused in combination with legalGroundDescriptionKey in archive issues 
          dataSubjectEndofBusinessEndPoint: `${servicePath}/dataSubjectEndOfBusiness`,
          dataSubjectLegalEntitiesEndPoint: `${servicePath}/dataSubjectLegalEntities`,
          dataSubjectLastRetentionStartDatesEndPoint: `${servicePath}/retentionStartDate`,
          dataSubjectsEndofResidenceEndPoint: `${servicePath}/endOfResidenceDS`,
          dataSubjectsEndofResidenceConfirmationEndPoint: `${servicePath}/endOfResidenceDSConfirmation`,
          dataSubjectLegalGroundDeletionEndPoint: `${servicePath}/deleteLegalGroundInstances`,
          dataSubjectsLegalGroundDestroyingEndPoint: `${servicePath}/destroyLegalGroundInstances`,
          legalGroundDeletionAsync: false,
          archive: true,
          legalGroundArchiveEndOfResidenceEndPoint: `${servicePath}/endOfResidence`,
          legalGroundArchiveDeletionEndPoint: `${servicePath}/archive`,
          legalGroundArchiveDestroyingEndPoint: `${servicePath}/destruction`,
          startTimes: (Object.entries(entity.elements)).reduce( (acc, [name, value]) => {
            if (value['@PersonalData.FieldSemantics'] === 'EndOfBusinessDate' && value.type !== 'cds.Association' && value.type !== 'cds.Composition') {
              const startTime = {
                startTime: name,
                startTimeDescription: translate(value["@Common.Label"] || name),
                //startTimeDescriptionKey: name <-- caused in combination with legalGroundDescriptionKey in archive issues  
              }
              if (getTranslationKey(value["@Common.Label"])) result.startTimeDescriptionKey = getTranslationKey(value["@Common.Label"])
              acc.push(startTime)
            }
            return acc
          }, []),
          legalGroundKeyColumns: entity.keys ? (Object.entries(entity.keys)).map( ([name, value]) => {
            const result = {
              keyFieldName: name,
              keyFieldDescription: translate(value["@Common.Label"] || name),
              keyFieldType: mapCDStoDRMtype(value.type)
            }
            if (getTranslationKey(value["@Common.Label"])) result.keyFieldDescriptionKey = getTranslationKey(value["@Common.Label"])
            return result
          }) : [],
          conditions: buildConditionsForLegalGround(nameOf(entity, eName), entity.elements, entity),
          legalGroundBaseURL: null,
          selectionCriteria: selectionCriteria,
          destruction: {
            legalGroundDestructionBaseURL: null,
            legalGroundDestructionEndpoint: `${servicePath}/destruction`,
            legalGroundDestructionSimulationEndpoint: `${servicePath}/simulateDestruction`,
            //Offer all properties for selection - except if FilterRestrictions are given for the field & if field is annotated with HiddenFilter or UI.Hidden then it is also ignored
            //Add ValueHelp if Common.ValueList is definied
            selectionCriteria: selectionCriteria
          }
        }
        if (o.registerVH) continue

        if (getTranslationKey(entity['@Core.Description'])) 
          legalGround.legalGroundDescriptionKey = getTranslationKey(entity['@Core.Description'])
        if (!entity['@PersonalData.DataSubjectRole'])
          LOG.warn(`Entity ${entity.name} does not have the @PersonalData.DataSubjectRole annotation`)
        if (cds.env.requires.drm.legalGroundPerDataSubject[entity['@PersonalData.DataSubjectRole']] !== undefined) {
          cds.env.requires.drm.legalGroundPerDataSubject[entity['@PersonalData.DataSubjectRole']] = 
            [
              legalGround, 
              ...cds.env.requires.drm.legalGroundPerDataSubject[entity['@PersonalData.DataSubjectRole']]
            ]
        } else {
          cds.env.requires.drm.legalGroundPerDataSubject[entity['@PersonalData.DataSubjectRole']] = [legalGround]
        }
      }
    }

    function handleValueList(value, name, entityName, entity, isCondition = false) {
      if (value['@Common.ValueList.CollectionPath'] && value.type !== 'cds.Association' && value.type !== 'cds.Composition') {
        const valueField = value['@Common.ValueList.Parameters'] ? value['@Common.ValueList.Parameters'].find(param => param['$Type'] === 'Common.ValueListParameterInOut' || param['$Type'] === 'Common.ValueListParameterOut')?.ValueListProperty : Object.entries(entity.keys)[0][0]
        const valueDescField = value['@Common.ValueList.Parameters'] ? value['@Common.ValueList.Parameters'].filter(param => param['$Type'] === 'Common.ValueListParameterDisplayOnly').reduce((acc, val) => {
          if (val && val.ValueListProperty && acc.length === 0)
            acc += `${val.ValueListProperty}`
          else if (val && val.ValueListProperty)
            acc += `|| ', ' || ${val.ValueListProperty}`
          return acc
        }, '') : Object.entries(entity.keys)[0][0]
        const ConditionVHName = (o.registerVH ? `DRMService.` : '') +  `valueHelp_${isCondition ? 'condition' : 'selection'}_${entityName}_${value.keys ? name + '_' + value.keys[0].ref[0] : name}`
        srv.entities[ConditionVHName] = conditionEntity
        srv.entities[ConditionVHName].name = `DRMService.${ConditionVHName}`
        if (o.registerVH) return `${servicePath}/${ConditionVHName}`;
        srv.on('READ', srv.entities[ConditionVHName], async req => {
          const result = await SELECT.from(srv.entities[value['@Common.ValueList.CollectionPath']]).columns(
            `${valueField} as ${isCondition ? 'conditionFieldValue' : 'value'}`,
            `${valueDescField} as ${isCondition ? 'conditionFieldValueDescription' : 'valueDescription'}`
          )
          LOG.debug(`Result Value Help for ${ConditionVHName}`, result)
          return result
        })
        return `${servicePath}/${ConditionVHName}`
      }
      return false
    }

    function buildConditionsForLegalGround(entityName, elements, entity) {
      return (Object.entries(elements)).reduce( (acc, [name, value]) => {
        const endPoint = handleValueList(value, name, entityName, entity, true)
        if (endPoint) {
          const result = {
            conditionFieldName: name,
            //conditionFieldValue: 'abc?', //REVISIT - in model def but not examples
            // conditionFieldDescriptionKey - only mentioned in here: https://api.sap.com/api/DSAPIsImplementedByApplication/resource
            conditionFieldType: mapCDStoDRMtype(value.type),
            conditionFieldDescription: translate(value["@Common.Label"] || name),
            conditionFieldValueHelpEndPoint: endPoint
          }
          if (getTranslationKey(value["@Common.Label"])) result.conditionFieldDescriptionKey = getTranslationKey(value["@Common.Label"])
          acc.push(result)
        }
        return acc
      }, [])
    }

    function mapCDStoDRMtype (type) {
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

    function fieldIsAllowedForRange (field, type, entity) {
      const filterExprRestriction = entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'] && entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'].some(restriction => 
        restriction.Property['='] === field  && restriction.AllowedExpressions === 'SingleValue'
      ) //Range not allowed if there is a Filter Expression existing allowing only SingleValue
      const filterRangeWanted = entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'] && entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'].some(restriction => 
        restriction.Property['='] === field  && restriction.AllowedExpressions === 'SingleRange'
      )
      return filterRangeWanted || (type !== 'String' && type !== 'Boolean' && !filterExprRestriction) //by default false - should be true when Integer, Decimal, Timestamp
    }

    function fieldIsAllowedForFiltering (field, entity) {
      return (
          !(entity['@Capabilities.FilterRestrictions.NonFilterableProperties'] && entity['@Capabilities.FilterRestrictions.NonFilterableProperties'].some(restriction => 
          restriction['='] === field.name
        )) && !field['@UI.HiddenFilter'] && !field['@UI.Hidden'] && !field.key && 
          field['@PersonalData.FieldSemantics'] !== 'EndOfBusinessDate' && 
          (!entity['@UI.SelectionFields'] || (entity['@UI.SelectionFields'] && entity['@UI.SelectionFields'].some(selectionField => selectionField['='] === field.name)))
      ) || (
        entity['@Capabilities.FilterRestrictions.RequiredProperties'] && 
        entity['@Capabilities.FilterRestrictions.RequiredProperties'].some(selectionField => selectionField['='] === field.name)
      )
    }

    /**
     * Fields are considered, if
     * - @Capabilities.FilterRestrictions.Filterable is not false on the entity
     * - data type is from cds
     * - field is not annotated with @UI.HiddenFilter or @UI.Hidden
     * - field is not part of @Capabilities.FilterRestrictions.NonFilterableProperties
     * - field is not a key and not a PersonalData.FieldSemantics = EndOfBusinessDate
     * - UI.SelectionFields are not defined or if defined property is in
     * - if field is part of @Capabilities.FilterRestrictions.RequiredProperties it is considered
     * @param {*} entityName 
     * @param {*} elements 
     * @param {*} entity 
     * @returns 
     */
    function buildSelectionCriteriaForLegalGround(entityName, elements, entity) {
      if (entity['@Capabilities.FilterRestrictions.Filterable'] === false) return undefined //Do not add Filters if the entity cannot be filtered
      return (Object.entries(elements)).reduce( (acc, [name, value]) => {
        const type = mapCDStoDRMtype(value.type)
        if (type && fieldIsAllowedForFiltering(value, entity) ) {
          let selectionCriteria = {
            name: name,
            displayName: translate(value["@Common.Label"] || name),
            //displayNameKey: value["@Common.Label"] || name, //For translation -- REVISIT - currently crashes
            type: type, //String, Integer, Decimal, Boolean, Timestamp
            isRangeEnabled: fieldIsAllowedForRange(name, type, entity)
          }
          if (getTranslationKey(value["@Common.Label"] || name)) selectionCriteria.displayNameKey = getTranslationKey(value["@Common.Label"] || name)

          if (value['@Core.Description']) {
            selectionCriteria.description = translate(value['@Core.Description'])
            if (getTranslationKey(value["@Core.Description"])) selectionCriteria.descriptionKey = getTranslationKey(value["@Core.Description"])
          }
          const endPoint = handleValueList(value, name, entityName, entity)
          if (endPoint) selectionCriteria.valueHelpEndPoint = endPoint

          acc.push(selectionCriteria)
        }
        return acc
      }, [])
    }

    const buildBaseUrl = (req) => {
      let url = ''
      if (process.env.NODE_ENV === 'production') url += 'https://'
      url += req._req ? req._req.get('host') : req.req.get('host')
      return url
    }
    if (!o.registerVH)
    srv.on('READ', legalGrounds, async req => {
      if (Object.values(cds.env.requires.drm.legalGroundPerDataSubject)[0][0].legalGroundBaseURL === null) {
        const baseUrl = buildBaseUrl(req)
        for (const legalGrounds of Object.values(cds.env.requires.drm.legalGroundPerDataSubject)) {
          legalGrounds.forEach(legalGround => {
            legalGround.legalGroundBaseURL = baseUrl
            legalGround.destruction.legalGroundDestructionBaseURL = baseUrl
          })
        }
      }
      const response = {
        legalGrounds: req.data.ID ? cds.env.requires.drm.legalGroundPerDataSubject[req.data.ID] : Object.values(cds.env.requires.drm.legalGroundPerDataSubject).reduce((acc, val) => {
          acc.push(...val)
          return acc
        }, [])
      }
      LOG.debug('Transactional data discovery:', response)
      req.reply(response)
    })
}


module.exports = serveLegalGrounds