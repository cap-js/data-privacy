const cds = require('@sap/cds');
const LOG = cds.log('data-privacy');
const { translationUtils, _getRoot, _getLegalEntityIDField } = require('../utils');

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

const nameOf = (entity, eName) => entity.name ? entity.name.split('.')[entity.name.split('.').length-1] : eName ? eName.split('.')[eName.split('.').length-1] : null

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
  
function getDPIentities(model, drmSrv) {
    const iLMObjects = [], dataSubjects = [], organizationAttributes = [], usedI18Nkeys = [], handlersToRegister = [], messages = [];

    const { translate, getTranslationKey } = translationUtils(model);
    const servicePath = drmSrv.path ?? drmSrv['@path'];

    //Valid types are: selection, condition, orgAttribute
    function handleValueList(value, name, entityName, entity, type = 'selection') {
        if (value['@Common.ValueList.CollectionPath'] && value.type !== 'cds.Association' && value.type !== 'cds.Composition') {
          const valueField = value['@Common.ValueList.Parameters'] ? value['@Common.ValueList.Parameters'].find(param => param['$Type'] === 'Common.ValueListParameterInOut' || param['$Type'] === 'Common.ValueListParameterOut')?.ValueListProperty : Object.entries(entity.keys)[0][0]
          const valueDescField = value['@Common.ValueList.Parameters'] ? value['@Common.ValueList.Parameters'].filter(param => param['$Type'] === 'Common.ValueListParameterDisplayOnly').reduce((acc, val) => {
            if (val && val.ValueListProperty && acc.length === 0)
              acc += `${val.ValueListProperty}`
            else if (val && val.ValueListProperty)
              acc += `|| ', ' || ${val.ValueListProperty}`
            return acc
          }, '') : Object.entries(entity.keys)[0][0]
          const ConditionVHName = `valueHelp_${type}_${entityName}_${value.keys ? name + '_' + value.keys[0].ref[0] : name}`;
          const rootEntity = _getRoot(entity);
          const namespace = rootEntity.name.substring(0, rootEntity.name.length - nameOf(rootEntity).length - 1)
          const targetEntity = 
            model.definitions[`${namespace}.${value['@Common.ValueList.CollectionPath']}`] 
            ?? model.definitions[`${drmSrv.name}.${value['@Common.ValueList.CollectionPath']}`] 
            ?? entity.elements[value._foreignKey4]?._target;
          if (!targetEntity) {
            messages.push({
              message: `The target "${`${namespace}.${value['@Common.ValueList.CollectionPath']}`}" of the @Common.ValueList annotation for ${entityName}.${name} could not be found!`,
              severity: 'ERROR'
            })
            return null;
          }
          const conditionE = new cds.builtin.classes.entity(conditionEntity);
          conditionE.name = `${drmSrv.name}.${ConditionVHName}`;
          handlersToRegister.push({
            event: 'READ',
            name: ConditionVHName,
            entity: conditionE,
            handler: async () => {
              const result = await SELECT.from(targetEntity).columns(
                `${valueField} as ${type === 'condition' ? 'conditionFieldValue' : (type === 'orgAttribute' ? 'organizationAttributeValue' : 'value')}`,
                `${valueDescField} as ${type === 'condition' ? 'conditionFieldValueDescription' : (type === 'orgAttribute' ? 'organizationAttributeValueDescription' : 'valueDescription')}`
              )
              LOG.debug(`Result Value Help for ${ConditionVHName}`, result)
              return result
            }
          });
          return `${servicePath}/${ConditionVHName}`;
        } else if (entity.elements[value._foreignKey4]?.type === 'cds.Association' || entity.elements[value._foreignKey4]?.type === 'cds.Composition') { //Case of missing ValueList annotation -> But its a relation
          const VHName = `valueHelp_${type}_${entity.elements[value._foreignKey4]._target.name.replaceAll('.', '_')}`;
          const keys = Object.keys(entity.elements[value._foreignKey4]._target.keys);
          const target = entity.elements[value._foreignKey4]._target
          //REVISIT: HeaderInfo.Title might be edmJson leading to problems
          let descriptionField = target.elements[keys[0]]['@Common.Text']?.['='] ?? target['@UI.HeaderInfo.Title.Value']?.['='] ?? keys[0];
          const conditionE = new cds.builtin.classes.entity(conditionEntity);
          conditionE.name = `${drmSrv.name}.${VHName}`;
          handlersToRegister.push({
            event: 'READ',
            name: VHName,
            entity: conditionE,
            handler: async () => {
              const result = await SELECT.distinct.from(target).columns(
                `${keys[0]} as ${type === 'condition' ? 'conditionFieldValue' : (type === 'orgAttribute' ? 'organizationAttributeValue' : 'value')}`,
                `${descriptionField} as ${type === 'condition' ? 'conditionFieldValueDescription' : (type === 'orgAttribute' ? 'organizationAttributeValueDescription' : 'valueDescription')}`
              )
              LOG.debug(`Result Value Help for ${VHName}`, result)
              return result
            }
          });
          return `${servicePath}/${VHName}`;
        }
        return null
    }
  
    function buildConditions(entityName, elements, entity) {
        return (Object.entries(elements)).reduce( (acc, [name, value]) => {
          const endPoint = handleValueList(value, name, entityName, entity, 'condition')
          //Fields which are FieldSemantics are not destined for conditions - like legal entity or data subject ID
          if (endPoint && !value["@PersonalData.FieldSemantics"]) {
            const result = {
              conditionFieldName: name,
              conditionFieldType: mapCDStoDRMtype(value.type),
              conditionFieldDescription: translate(value["@Common.Label"] || name),
              conditionFieldValueHelpEndPoint: endPoint,
            }
            if (getTranslationKey(value["@Common.Label"])) {
              const key = getTranslationKey(value["@Common.Label"]);
              usedI18Nkeys.push(key);
              result.conditionFieldDescriptionKey = key
            }
            acc.push(result)
          }
          return acc
        }, [])
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
    function buildSelectionCriteria(entityName, elements, entity) {
        if (entity['@Capabilities.FilterRestrictions.Filterable'] === false) return undefined //Do not add Filters if the entity cannot be filtered
        return (Object.entries(elements)).reduce( (acc, [name, value]) => {
          const type = mapCDStoDRMtype(value.type)
          if (type && fieldIsAllowedForFiltering(value, entity) ) {
            let selectionCriteria = {
              selectionCriteriaName: name,
              selectionCriteriaDisplayName: translate(value["@Common.Label"] || name),
              selectionCriteriaType: type, //String, Integer, Decimal, Boolean, Timestamp
              isRangeEnabled: fieldIsAllowedForRange(name, type, entity)
            }
            if (getTranslationKey(value["@Common.Label"] || name)) {
              const key = getTranslationKey(value["@Common.Label"] || name)
              usedI18Nkeys.push(key);
              selectionCriteria.selectionCriteriaDisplayNameKey = key
            }
  
            if (value['@Core.Description']) {
              selectionCriteria.selectionCriteriaDescription = translate(value['@Core.Description'])
              if (getTranslationKey(value["@Core.Description"])) {
                const key = getTranslationKey(value["@Core.Description"]);
                usedI18Nkeys.push(key);
                selectionCriteria.selectionCriteriaDescriptionKey = key;
              }
            }
            const endPoint = handleValueList(value, name, entityName, entity, 'selection')
            if (endPoint) selectionCriteria.selectionCriteriaValueHelpEndPoint = endPoint
  
            acc.push(selectionCriteria)
          }
          return acc
        }, [])
    }

    function buildOrganizationAttribute(entity) {
      const orgAttributeName = _getLegalEntityIDField(entity.elements);
      const orgAttribute = {
        organizationAttributeName : orgAttributeName,
        organizationAttributeDescription : translate(entity.elements[orgAttributeName]['@Common.Label']) ?? orgAttributeName,
        organizationAttributeBaseURL : '~{srv-api/srv-url}',
        organizationAttributeValueHelpEndPoint : `${servicePath}/<Placeholder>`
      }
      const endPoint = handleValueList(entity.elements[orgAttributeName], orgAttributeName, nameOf(entity), entity, 'orgAttribute')
      if (endPoint) { //Case of annotated Common.ValueList
        orgAttribute.organizationAttributeValueHelpEndPoint = endPoint;
      } else if (entity.elements[entity.elements[orgAttributeName]._foreignKey4]?.type === 'cds.Association' || entity.elements[entity.elements[orgAttributeName]._foreignKey4]?.type === 'cds.Composition') { //Case of missing ValueList annotation -> But its a relation
        const VHName = `valueHelp_orgAttribute_${entity.elements[entity.elements[orgAttributeName]._foreignKey4]._target.name.replaceAll('.', '_')}`;
        const element = entity.elements[orgAttributeName];
        const keys = Object.keys(entity.elements[element._foreignKey4]._target.keys);
        const target = entity.elements[element._foreignKey4]._target
        //REVISIT: HeaderInfo.Title might be edmJson leading to problems
        let descriptionField = target.elements[keys[0]]['@Common.Text']?.['='] ?? target['@UI.HeaderInfo.Title.Value']?.['='] ?? keys[0];
        const conditionE = new cds.builtin.classes.entity(conditionEntity);
        conditionE.name = `${drmSrv.name}.${VHName}`;
        handlersToRegister.push({
          event: 'READ',
          name: VHName,
          entity: conditionE,
          handler: async () => {
            const result = await SELECT.distinct.from(target).columns(
              `${keys[0]} as organizationAttributeValue`,
              `${descriptionField} as organizationAttributeValueDescription`
            )
            LOG.debug(`Result Value Help for ${VHName}`, result)
            return result
          }
        });
        orgAttribute.organizationAttributeValueHelpEndPoint = `${servicePath}/${VHName}`;
      } else { //Case of missing ValueList annotation -> Instead use SELECT.distinct
        const VHName = `valueHelp_orgAttribute_${entity.name.replaceAll('.', '_')}_${orgAttributeName}`;
        const element = entity.elements[orgAttributeName];
        let descriptionField = element['@Common.Text']?.['='] ?? orgAttributeName;
        const conditionE = new cds.builtin.classes.entity(conditionEntity);
        conditionE.name = `${drmSrv.name}.${VHName}`;
        handlersToRegister.push({
          event: 'READ',
          name: VHName,
          entity: conditionE,
          handler: async () => {
            const result = await SELECT.distinct.from(entity).columns(
              `${orgAttributeName} as organizationAttributeValue`,
              `${descriptionField} as organizationAttributeValueDescription`
            )
            LOG.debug(`Result Value Help for ${VHName}`, result)
            return result
          }
        });
        orgAttribute.organizationAttributeValueHelpEndPoint = `${servicePath}/${VHName}`;
      }
      if (getTranslationKey(entity.elements[orgAttributeName]['@Common.Label'])) {
        const key = getTranslationKey(entity.elements[orgAttributeName]['@Common.Label']);
        usedI18Nkeys.push(key);
        orgAttribute.organizationAttributeDescriptionKey = key;
      }
      if (!organizationAttributes.some(o => o.organizationAttributeName === orgAttribute.organizationAttributeName))
        organizationAttributes.push(orgAttribute);
      else if (organizationAttributes.some(o => o.organizationAttributeName === orgAttribute.organizationAttributeName && o.organizationAttributeValueHelpEndPoint !== orgAttribute.organizationAttributeValueHelpEndPoint)) {
        const existingAttribute = organizationAttributes.find(o => o.organizationAttributeName === orgAttribute.organizationAttributeName && o.organizationAttributeValueHelpEndPoint !== orgAttribute.organizationAttributeValueHelpEndPoint)
        messages.push({
          message: `Organisational attributes require unique organizationAttributeName properties! Tried to register another attribute for the name ${orgAttribute.organizationAttributeName} now from ${entity.name} with the generated value help endpoint ${orgAttribute.organizationAttributeValueHelpEndPoint} deviating from the existing registered attribute with the value help endpoint ${existingAttribute.organizationAttributeValueHelpEndPoint}`,
          severity: 'WARNING'
        })
      }
      return orgAttribute;
    }
    
    if (!cds.env.requires.dpi) cds.env.requires.dpi = {}

    const iLMObjectsWithDynamicRole = [];
    for(const eName in model.definitions) {
        const entity = model.definitions[eName];
        if (!entity.name) entity.name = eName;
        if (!entity.query && !entity.projection && entity.kind === 'entity' && entity['@PersonalData.EntitySemantics'] === 'DataSubject') {
          const entityName = eName.split('.')[eName.split('.').length-1];
          const role = entity['@PersonalData.DataSubjectRole'];
          if (dataSubjects.some(ds => ds.dataSubjectRoleName === role)) {
            continue
          }
          if (!role) {
            messages.push({
              message: `${entity.name} lacks the @PersonalData.DataSubjectRole annotation! It is required for the Data Privacy service to properly work.`,
              severity: 'ERROR'
            })
            return;
          }
          if (!entity['@Communication.Contact.n.given'] || !entity['@Communication.Contact.n.surname'] || !(entity['@Communication.Contact.email'] || entity['@Communication.Contact.bday'])) {
            messages.push({
              message: `The Data Subject ${entity.name} has to be annotated with @Communication.Contact and name as well as email or bday have to be defined for the Data Privacy Integration service to properly work!`,
              severity: 'WARNING'
            })
          }
          const dataSubject = {
            dataSubjectRoleName: role,
            dataSubjectDescription: translate(entity['@Core.Description'] || entityName),
            dataSubjectBaseURL: '~{srv-api/srv-url}',
            dataSubjectBlockingEndPoint : `${servicePath}/dataSubjectBlocking`,
            dataSubjectInformationEndPoint : `${servicePath}/dataSubjectInformation`,
            dataSubjectsDestroyingEndPoint : `${servicePath}/dataSubjectsDestroying`
          }
          if (getTranslationKey(entity['@Core.Description'] || entityName)) {
            const key = getTranslationKey(entity['@Core.Description'] || entityName);
            usedI18Nkeys.push(key);
            dataSubject.dataSubjectDescriptionKey = key;
          }
          dataSubjects.push(dataSubject)
        } else if (entity['@PersonalData.EntitySemantics'] === 'Other' && entity['@cds.drm.rootEntity']) {
          if (!entity['@PersonalData.DataSubjectRole']) {
            messages.push({
              message: `${entity.name} lacks the @PersonalData.DataSubjectRole annotation! It is required for the Data Privacy service to work properly.`,
              severity: 'ERROR'
            })
          }
          if (!_getLegalEntityIDField(entity.elements)) {
            messages.push({
              message: `${entity.name} lacks a property annotated with @PersonalData.FieldSemantics : 'LegalEntityID', which is required for the Data Privacy service to work properly.`,
              severity: 'ERROR'
            })
          }
          if (entity['@PersonalData.DataSubjectRole']['=']) {
            iLMObjectsWithDynamicRole.push(nameOf(entity, eName))
          }
          const selectionCriteria = buildSelectionCriteria(nameOf(entity, eName), entity.elements, entity);
          const orgAttribute = buildOrganizationAttribute(entity);
          const iLMObject = {
            iLMObjectName: nameOf(entity, eName),
            iLMObjectType: 'Transaction',
            iLMObjectDescription: translate(entity['@Core.Description']) || nameOf(entity, eName),
            iLMObjectBaseURL: '~{srv-api/srv-url}',
            organizationAttributeName: orgAttribute.organizationAttributeName,
            referenceDates: (Object.entries(entity.elements)).reduce( (acc, [name, value]) => {
              if (value['@PersonalData.FieldSemantics'] === 'EndOfBusinessDate' && value.type !== 'cds.Association' && value.type !== 'cds.Composition') {
                const startTime = {
                  referenceDateName: name,
                  referenceDateDescription: translate(value["@Common.Label"] || name),
                }
                if (getTranslationKey(value["@Common.Label"])) {
                  const key = getTranslationKey(value["@Common.Label"]);
                  usedI18Nkeys.push(key);
                  startTime.referenceDateDescriptionKey = key;
                }
                acc.push(startTime)
              }
              return acc
            }, []),
            conditions: buildConditions(nameOf(entity, eName), entity.elements, entity),
            dataSubjectBlockingConfiguration: {
              dataSubjectEndOfBusinessEndPoint : `${servicePath}/dataSubjectEndOfBusiness`,
              dataSubjectOrganizationAttributesEndPoint : orgAttribute.organizationAttributeValueHelpEndPoint,
              dataSubjectLastRetentionStartDatesEndPoint : `${servicePath}/retentionStartDate`,
              dataSubjectsEndOfResidenceEndPoint : `${servicePath}/dataSubjectsEndOfResidence`,
              dataSubjectsEndOfResidenceConfirmationEndPoint : `${servicePath}/dataSubjectsEndOfResidenceConfirmation`,
              dataSubjectILMObjectBlockingEndPoint : `${servicePath}/deleteILMObjectInstances`,
              dataSubjectsILMObjectDestroyingEndPoint : `${servicePath}/destroyILMObjectInstances`,
            },
            archivingConfiguration: {
              iLMObjectArchiveEndOfResidenceEndPoint: `${servicePath}/endOfResidence`,
              iLMObjectArchiveEndPoint: `${servicePath}/archive`,
              iLMObjectKeys: entity.keys ? (Object.entries(entity.keys)).map( ([name, value]) => {
                const result = {
                  keyFieldName: name,
                  keyFieldDescription: translate(value["@Common.Label"] || name),
                  keyFieldType: mapCDStoDRMtype(value.type)
                }
                if (getTranslationKey(value["@Common.Label"])) {
                  const key = getTranslationKey(value["@Common.Label"])
                  usedI18Nkeys.push(key);
                  result.keyFieldDescriptionKey = key;
                }
                return result
              }) : [],
              selectionCriteria: selectionCriteria
            },
            destructionConfiguration: {
              iLMObjectDestructionEndPoint: `${servicePath}/destruction`,
              iLMObjectDestructionSimulationEndPoint: `${servicePath}/simulateDestruction`,
              selectionCriteria: selectionCriteria
            },
            dataSubjectRoles: []
          }
          //Only done for static role assignemnt, if iLMObject has dynamic role, 
          // assignment is done after all objects have been processed
          if (typeof entity['@PersonalData.DataSubjectRole'] === 'string') {
            iLMObject.dataSubjectRoles.push(
              {
                dataSubjectRoleName: entity['@PersonalData.DataSubjectRole']
              }
            )
          }
  
          if (getTranslationKey(entity['@Core.Description'])) {
            const key = getTranslationKey(entity['@Core.Description'])
            usedI18Nkeys.push(key);
            iLMObject.iLMObjectDescriptionKey = key;
          }
          iLMObjects.push(iLMObject);
        }
    }

    for (const iLMObjectName of iLMObjectsWithDynamicRole) {
      const iLMObject = iLMObjects.find(obj => obj.iLMObjectName === iLMObjectName);
      for (const role of dataSubjects) {
        iLMObject.dataSubjectRoles.push({
          dataSubjectRoleName: role
        })
      }
    }

    return {
        dataSubjectRoles : dataSubjects,
        organizationAttributes: organizationAttributes,
        iLMObjects: iLMObjects,
        messages: messages,
        usedI18Nkeys: usedI18Nkeys,
        handlersToRegister : handlersToRegister
    }
}

module.exports = {
    getDPIentities
}