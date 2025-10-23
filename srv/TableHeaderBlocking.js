const cds = require('@sap/cds');
const DPIRetentionService = require('./DPIRetention');
const { _buildWhereClauseForDS, _buildWhereClauseForDSsArr, _getDataSubjectEmailField, _getDataSubjectEntities, _getDataSubjectEntityByRole, _getDataSubjectIDField, _getDataSubjectNameField, _getEndOfBusinessDateField, _getEntityForILMObject, _getLegalEntityIDField, _getWholeObjectTree, _nullForeignKeysOnILMObject, whereForConditionSet } = require('../lib/utils');
const getDPIentities = require('../lib/model/get-dpi-entities');
const dayjs = require('dayjs');

const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)
const LOG = cds.log('data-privacy-retention')
const { path } = cds.utils;

module.exports = class TableHeaderBlockingService extends DPIRetentionService {
  async init() {
    const { BlockingStore } = cds.entities('sap.capire.blocking')

    this.on('dataSubjectEndOfBusiness', async req => {
      const { applicationName, iLMObjectName: iLMObject, dataSubjectRoleName: dataSubjectRole, dataSubjectId: dataSubjectID } = req.data
      //validate application name
      let package_json = path.join(cds.root, 'package.json')
      let { appName, description } = require(package_json)
      if (applicationName !== appName) {
        return new ResponseMesssage(400, { message: 'Application name does not match the service application name.' });
      }
      LOG.info(`dataSubjectEndOfBusiness request for role ${dataSubjectRole} and ID ${dataSubjectID} and iLMObject ${iLMObject} and app ${applicationName}.`)
      const iLMObjectEntityDef = _getEntityForILMObject(iLMObject, this)
      const where = _buildWhereClauseForDS(iLMObjectEntityDef, dataSubjectID, dataSubjectRole)
      const eobField = _getEndOfBusinessDateField(iLMObjectEntityDef.elements)
      LOG.debug(`Where clause`, where)
      const result = await SELECT.one.from(iLMObjectEntityDef).where(where).columns(`max(${eobField}) as endOfBusiness`)
      if (!result || (result && !result.endOfBusiness)) {
        req.res.statusCode = 204 //DRM defines to respond with 204 when no transactional item was found
        return
      }
      LOG.debug(`Result of select`, result)
      const expired = dayjs().isSameOrAfter(result.endOfBusiness)
      const getNotExpiredReason = async (endOfBusinessDate) => {
        where.push(
          'and',
          { ref: [eobField] },
          '=',
          { val: endOfBusinessDate }
        )
        const result2 = await SELECT.one.from(iLMObjectEntityDef).where(where).columns('ID')

        return `${dataSubjectRole} ${dataSubjectID} has a ${iLMObjectEntityDef.name} entity with ID ${result2.ID} which reaches end of business on ${endOfBusinessDate}`
      }
      const response = {
        dataSubjectExpired: expired,
        dataSubjectNotExpiredReason: !expired ? await getNotExpiredReason(result.endOfBusiness) : ''
      }
      LOG.info(`dataSubjectEndOfBusiness outgoing response`, response)
      return response

    })

    this.on('dataSubjectOrganizationAttributeValues', async req => {
      const { applicationName, organizationAttributeName, iLMObjectName: iLMObject, dataSubjectRoleName: dataSubjectRole, dataSubjectId: dataSubjectID } = req.data
      //validate application name
      let package_json = path.join(cds.root, 'package.json')
      let { appName, description } = require(package_json)
      if (applicationName !== appName) {
        return new ResponseMesssage(400, { message: 'Application name does not match the service application name.' });
      }
      LOG.info(`dataSubjectOrganizationAttributeValues request for the iLMObject ${iLMObject}, the data subject role ${dataSubjectRole} with the data subject ID ${dataSubjectID} and app ${applicationName} and org attribute ${organizationAttributeName}`)
      const iLMObjectEntityDef = _getEntityForILMObject(iLMObject, this)
      const where = _buildWhereClauseForDS(iLMObjectEntityDef, dataSubjectID, dataSubjectRole)
      const legalEntityField = organizationAttributeName ?? _getLegalEntityIDField(iLMObjectEntityDef.elements)
      LOG.debug(`where clause`, where);
      if (!iLMObjectEntityDef.elements[legalEntityField] || iLMObjectEntityDef.elements[legalEntityField]?.['@PersonalData.FieldSemantics'] !== 'LegalEntityID') {
        return req.error({
          code: 'ORG_ATTRIBUTE_NOT_EXISTING',
          status: 400
        })
      }
      const result = await SELECT.distinct.from(iLMObjectEntityDef).where(where).columns(`${legalEntityField} as organizationAttributeValue`);
      LOG.debug(`result`, result)
      return result
    })

    this.on('dataSubjectLatestRetentionStartDates', async req => {
      const { applicationName, dataSubjectRoleName: dataSubjectRole, organizationAttributeName, organizationAttributeValue, referenceDateName: startTime, dataSubjectId: dataSubjectID, iLMObjectName: iLMObject, retentionSet } = req.data
      LOG.info(`dataSubjectLatestRetentionStartDates request for the iLMObject ${iLMObject}, the data subject role ${dataSubjectRole}`,
        ` with the data subject ID ${dataSubjectID}.`,
        `Application: ${applicationName}`,
        `The start time field is ${startTime} and the org attribute ${organizationAttributeName} with value ${organizationAttributeValue}`,
        `The retention condition set is`, retentionSet)

      const iLMObjectEntityDef = _getEntityForILMObject(iLMObject, this)
      const eobField = startTime || _getEndOfBusinessDateField(iLMObjectEntityDef.elements)
      const legalEntityField = organizationAttributeName ?? _getLegalEntityIDField(iLMObjectEntityDef.elements)

      const queries = []

      for (const rule of retentionSet) {
        const where = _buildWhereClauseForDS(iLMObjectEntityDef, dataSubjectID, dataSubjectRole)
        where.push(
          'and',
          { ref: [eobField] },
          '<=',
          { val: dayjs().format('YYYY-MM-DD') },
          'and',
          { ref: [legalEntityField] },
          '=',
          { val: organizationAttributeValue },
        )
        if (rule.conditionSet.length > 0) {
          where.push(
            'and',
            { xpr: whereForConditionSet(rule.conditionSet) }
          )
        }
        queries.push(
          SELECT.from(iLMObjectEntityDef).where(where).columns(`max(${eobField}) as retentionStartDate`)
        )
      }


      const results = await Promise.all(queries)
      //Return 204 if no retention start dates where found, e.g. no transactional data instances were found
      if (!results.some(s => s[0].retentionStartDate !== null)) {
        req.res.statusCode = 204
        return
      }

      const result = results.map((response, idx) => {
        return {
          retentionSetId: retentionSet[idx].retentionSetId,
          retentionStartDate: dayjs(response[0].retentionStartDate).format('YYYY-MM-DDTHH:mm:ss')
          //retentionStartDate: dayjs(response[0].retentionStartDate).utc(false).toISOString() //REVISIT: Proper but not chosen due to DRM strange handling
        }
      })
      LOG.debug(`retentionStartDate result`, result)
      return result
    })

    this.on('dataSubjectILMObjectInstanceBlocking', async req => {
      const { applicationName, dataSubjectId: dataSubjectID, dataSubjectRoleName: dataSubjectRole, maxDeletionDate,
        iLMObjectName } = req.data

      //validate application name
      let package_json = path.join(cds.root, 'package.json')
      let { appName, description } = require(package_json)
      if (applicationName !== appName) {
        return new ResponseMesssage(400, { message: 'Application name does not match the service application name.' });
      }

      LOG.info(`dataSubjectILMObjectInstanceBlocking request for the iLMObject ${iLMObjectName}, the data subject role ${dataSubjectRole}`,
        ` with the data subject ID ${dataSubjectID}.`,
        `App is ${applicationName}`,
        `The maxDeletionDate is ${maxDeletionDate}`)
      const iLMObjectEntityDef = _getEntityForILMObject(iLMObjectName, this)
      if (!iLMObjectEntityDef) {
        return req.error({
          code: 'INVALID_LEGAL_GROUND',
          status: 400
        })
      }
      const where = _buildWhereClauseForDS(iLMObjectEntityDef, dataSubjectID, dataSubjectRole)
      LOG.info(`Where clause: `, where)
      const toBeBlocked = await SELECT.from(iLMObjectEntityDef).where(where).columns(_getWholeObjectTree(iLMObjectEntityDef, dataSubjectRole))
      //Return 204 if no records where found
      if (toBeBlocked.length === 0) {
        req.res.statusCode = 204
        return
      }

      const blockedEntries = []
      toBeBlocked.forEach(iLMObject => {
        blockedEntries.push({
          objectType: iLMObjectEntityDef.name,
          objectKey: iLMObject.ID,
          objectAsBlob: JSON.stringify(iLMObject),
          dataSubjectID: dataSubjectID,
          dataSubjectRole: iLMObject['dataSubjectRole'] ?? dataSubjectRole,
          endOfRetentionDate: maxDeletionDate
        })
      })
      if (blockedEntries.length > 0) {
        LOG.info(`Blocked entities`, blockedEntries)
        await INSERT.into(BlockingStore).entries(blockedEntries)
      }
      await Promise.all(_nullForeignKeysOnILMObject(iLMObjectEntityDef, where)) //TODO: Think about feature flag
      await DELETE.from(iLMObjectEntityDef).where(where)
      req.res.status(200)
      return blockedEntries.length //We return something because returning nothng would cause 204 and 204 means we did not find any data
    })

    this.on(['dataSubjectsILMObjectInstancesDestroying'], async req => {
      const { applicationName, dataSubjectRoleName: dataSubjectRole, iLMObjectName: iLMObject } = req.data
      //validate application name
      let package_json = path.join(cds.root, 'package.json')
      let { appName, description } = require(package_json)
      if (applicationName !== appName) {
        return new ResponseMesssage(400, { message: 'Application name does not match the service application name.' });
      }

      LOG.info(`Destroy iLMObjects request for role ${dataSubjectRole} and iLMObject ${iLMObject} where end of retention is reached for app ${applicationName}.`)
      const iLMObjectEntityDef = _getEntityForILMObject(iLMObject, this)
      if (!iLMObjectEntityDef) {
        return req.error({
          code: 'INVALID_LEGAL_GROUND',
          status: 400
        })
      }
      const whereCondition = {
        objectType: iLMObjectEntityDef.name,
        dataSubjectRole: dataSubjectRole,
        endOfRetentionDate: { '<=': dayjs().format('YYYY-MM-DDTHH:mm:ssZ') },
      }
      LOG.info(`Where condition for destroy from blocking store.`, whereCondition)
      await DELETE.from(BlockingStore).where(whereCondition)
      req.res.statusCode = 202
    })

    this.on('dataSubjectBlocking', async req => {
      const { applicationName, dataSubjectRoleName: dataSubjectRole, dataSubjectId: dataSubjectID, maxDeletionDate } = req.data


      let package_json = path.join(cds.root, 'package.json')
      let { appName, description } = require(package_json)
      if (applicationName !== appName) {
        return new ResponseMesssage(400, { message: 'Application name does not match the service application name.' });
      }

      LOG.info(`Delete data subject request for role ${dataSubjectRole}, ID ${dataSubjectID} and application group ${applicationName} with end of retention ${maxDeletionDate}.`)
      const dsEntities = _getDataSubjectEntities(dataSubjectRole, this); //Ensures that data subject details are also retrived
      const model = cds.context?.model ?? cds.model;
      if (!model._iLMObjects) {
        const res = getDPIentities(model);
        model._iLMObjects = res.iLMObjects;
      }
      if (dsEntities.length === 0 || !model._iLMObjects)
        return req.error('Non existing data subject')
      //Delete if there are no active iLMObjects for data subject
      for (const iLMObject of model._iLMObjects) {
        const iLMObjectDef = _getEntityForILMObject(iLMObject.iLMObjectName, this);
        LOG.debug(`Where clause for getting active entities`, _buildWhereClauseForDS(iLMObjectDef, dataSubjectID, dataSubjectRole))
        const activeRecords = await cds.db.exists(iLMObjectDef).where(_buildWhereClauseForDS(iLMObjectDef, dataSubjectID, dataSubjectRole))
        if (activeRecords) {
          LOG.info(`Delete data subject for ${dataSubjectRole}, ID ${dataSubjectID} does not work due to active entities in ${iLMObjectDef.name}.`)
          return req.error({ message: 'Active records still exist for the entity', code: 400 })
        }
      }

      //Check if there are blocked records
      const blockedData = await cds.db.exists(BlockingStore).where({ dataSubjectID: dataSubjectID, dataSubjectRole: dataSubjectRole })
      for (const singleEntity of dsEntities) {
        const entity = await SELECT.one.from(singleEntity).where(_buildWhereClauseForDS(singleEntity, dataSubjectID, dataSubjectRole)).columns(_getWholeObjectTree(singleEntity, dataSubjectRole))
        LOG.debug(`Where clause for getting ${singleEntity.name}`, _buildWhereClauseForDS(singleEntity, dataSubjectID, dataSubjectRole), `with result`, entity)
        if (!entity) continue
        //dayjs() gives you the current date, if it is greater than maxDeletionDate then the data subject can deleted immediately
        //deleting immediately only allowed when no associated iLMObjects in blocking store
        if (dayjs().isBefore(maxDeletionDate) || blockedData)
          await INSERT.into(BlockingStore).entries([{
            objectType: singleEntity.name,
            objectKey: entity[_getDataSubjectIDField(singleEntity.elements)],
            objectAsBlob: JSON.stringify(entity),
            dataSubjectID: dataSubjectID,
            dataSubjectRole: entity['dataSubjectRole'] ?? dataSubjectRole,
            endOfRetentionDate: maxDeletionDate
          }])
        await DELETE.from(singleEntity.name).where(_buildWhereClauseForDS(singleEntity, dataSubjectID))
        LOG.info(`Deleted data subject:`, dataSubjectID)
      }
    })

    this.on('dataSubjectsDestroying', async req => {
      const { applicationName, dataSubjectRoleName: dataSubjectRole } = req.data
      //validate application name
      let package_json = path.join(cds.root, 'package.json')
      let { appName, description } = require(package_json)
      if (applicationName !== appName) {
        return new ResponseMesssage(400, { message: 'Application name does not match the service application name.' });
      }
      LOG.info(`Destroy data subjects request for role ${dataSubjectRole} and application group ${applicationName} where end of retention is reached.`)
      //Delete only possible if all iLMObjects also reached end of blocking

      const dataSubjectIDs = await SELECT.from(BlockingStore).where({ dataSubjectRole: dataSubjectRole })
        .groupBy('dataSubjectID')
        .columns('max(endOfRetentionDate) as lastEndOfRetention', 'dataSubjectID')
        .having(`endOfRetentionDate <= '${dayjs().format('YYYY-MM-DDTHH:mm:ssZ')}'`)
      if (dataSubjectIDs.length === 0) return
      const dataSubjectIDsToDestroy = []
      for (const { dataSubjectID } of dataSubjectIDs) {
        let hasActiveRecords = false
        for (const entityName in this.entities) { //srv.entities may cause problems as we do not check the whole data model
          const entity = this.entities[entityName]
          if (entity && entity['@PersonalData.EntitySemantics'] === 'Other') {
            const dataSubjectIDField = _getDataSubjectIDField(entity.elements)
            if (!dataSubjectIDField) continue
            const where = []
            where.push({ ref: [dataSubjectIDField] }, '=', { val: dataSubjectID });
            //For dynamic data subject role - then it is a path.
            if (entity['@PersonalData.DataSubjectRole']?.['=']) {
              where.push(
                'and',
                { ref: entity['@PersonalData.DataSubjectRole']['='] },
                '=',
                { val: dataSubjectRole }
              )
            } else if (entity['@PersonalData.DataSubjectRole'] !== dataSubjectRole) {
              LOG.debug(`Active records in ${entity} for data subject ${dataSubjectID} are not checked because the role ${dataSubjectRole} does not match the annotated role ${entity['@PersonalData.DataSubjectRole']}`)
              continue;
            }
            const activeRecords = await cds.db.exists(entity).where(where)
            LOG.info(`Data subject ${dataSubjectID} has active records in ${entity} and cannot be destroyed`)
            if (activeRecords) {
              hasActiveRecords = true
              break;
            }
          }
        }
        if (!hasActiveRecords)
          dataSubjectIDsToDestroy.push(dataSubjectID)
      }
      if (dataSubjectIDsToDestroy.length > 0) {
        LOG.info(`Destroy data subjects with the ID`, dataSubjectIDsToDestroy)
        await DELETE.from(BlockingStore).where({ dataSubjectID: { in: dataSubjectIDsToDestroy } })
      }
      req.res.statusCode = 200
      return `Destroyed ${dataSubjectIDsToDestroy.length} records`
    })

    /**
     * Return the list of data subjects associated 
     * with a given transactional data and data subject role for which the end of purpose has been reached.
     */
    this.on(['dataSubjectsEndOfResidence'], async req => {
      const { applicationName, iLMObjectName, dataSubjectRoleName, referenceDates } = req.data
      //validate application name
      let package_json = path.join(cds.root, 'package.json')
      let { appName, description } = require(package_json)
      if (applicationName !== appName) {
        return new ResponseMesssage(400, { message: 'Application name does not match the service application name.' });
      }

      LOG.info(`Requested dataSubjectsEndOfResidence for ${dataSubjectRoleName} and iLM object ${iLMObjectName} and app ${applicationName}`,
        `Reference dates:`, JSON.stringify(referenceDates))

      const iLMObjectEntity = _getEntityForILMObject(iLMObjectName, this)
      const dsField = _getDataSubjectIDField(iLMObjectEntity.elements)
      const legalField = _getLegalEntityIDField(iLMObjectEntity.elements)

      const dataSubjectEntity = _getDataSubjectEntityByRole(dataSubjectRoleName, this)
      //Second condition for case that role is dynamic
      if (!dataSubjectEntity && !iLMObjectEntity['@PersonalData.DataSubjectRole']['=']) {
        return req.error({
          code: 'DATA_SUBJECT_ROLE_NOT_EXISTING',
          status: 400
        })
      }
      const wheres = whereClauseForRetentionSets(referenceDates, iLMObjectEntity, dataSubjectRoleName);

      const [dataSubjectsMatchingConditions, dataSubjectsNotMatchingConditions] = await Promise.all([
        SELECT.distinct.from(iLMObjectEntity)
          .where(wheres.wheresWithCondition)
          .columns(`${dsField} as dataSubjectId`, `count(${legalField}) as sumRecords`).groupBy(dsField).orderBy(dsField),
        SELECT.distinct.from(iLMObjectEntity)
          .where(wheres.wheresWithNegConditions)
          .columns(`${dsField} as dataSubjectId`, `count(${legalField}) as sumRecords`).groupBy(dsField)
      ])

      LOG.debug(`Successful requests`, dataSubjectsMatchingConditions)
      LOG.debug(`nonConfirmCondition requests`, dataSubjectsNotMatchingConditions)

      return {
        success: dataSubjectsMatchingConditions.map(d => ({ dataSubjectId: d.dataSubjectId })),
        nonConfirmCondition: dataSubjectsNotMatchingConditions.map(d => ({ dataSubjectId: d.dataSubjectId }))
      }
    })

    this.on(['dataSubjectsEndOfResidenceConfirmation'], async req => {
      const { applicationName, iLMObjectName, dataSubjectRoleName, dataSubjects = [], referenceDates } = req.data
      //validate application name
      let package_json = path.join(cds.root, 'package.json')
      let { appName, description } = require(package_json)
      if (applicationName !== appName) {
        return new ResponseMesssage(400, { message: 'Application name does not match the service application name.' });
      }
      LOG.info(`Requested end of residence data subject confirmation for ${dataSubjectRoleName} and iLM object ${iLMObjectName} and app ${applicationName}`,
        `Reference dates:`, JSON.stringify(referenceDates))
      LOG.debug(`dataSubjectsEndOfResidenceConfirmation, data subject IDs`, dataSubjects)
      const dataSubjectIDs = dataSubjects.map(m => m.dataSubjectId)
      const iLMObjectEntity = _getEntityForILMObject(iLMObjectName, this)
      const where = dataSubjectIDs.length > 0 ? _buildWhereClauseForDSsArr(iLMObjectEntity, dataSubjectIDs) : []
      const dsField = _getDataSubjectIDField(iLMObjectEntity.elements)
      const legalField = _getLegalEntityIDField(iLMObjectEntity.elements)

      const dataSubjectEntity = _getDataSubjectEntityByRole(dataSubjectRoleName, this)
      //Second condition for case that role is dynamic
      if (!dataSubjectEntity && !iLMObjectEntity['@PersonalData.DataSubjectRole']?.['=']) {
        return req.error({
          code: 'DATA_SUBJECT_ROLE_NOT_EXISTING',
          status: 400
        })
      }
      const wheres = whereClauseForRetentionSets(referenceDates, iLMObjectEntity, dataSubjectRoleName);
      if (wheres.wheresWithCondition.length > 0) where.push('and')
      const [dataSubjectsMatchingConditions] = await Promise.all([
        SELECT.distinct.from(iLMObjectEntity)
          .where(where.concat(wheres.wheresWithCondition))
          .columns(`${dsField} as dataSubjectId`, `count(${legalField}) as sumRecords`).groupBy(dsField).orderBy(dsField)
      ])

      LOG.debug(`Successful requests`, dataSubjectsMatchingConditions)

      return dataSubjectsMatchingConditions.map(d => ({ dataSubjectId: d.dataSubjectId }))
    })

    this.on('dataSubjectInformation', async req => {
      const { applicationName, dataSubjectRoleName, dataSubjects } = req.data
      //validate application name
      let package_json = path.join(cds.root, 'package.json')
      let { appName, description } = require(package_json)
      if (applicationName !== appName) {
        return new ResponseMesssage(400, { message: 'Application name does not match the service application name.' });
      }
      LOG.info(`Requested data subject information for ${dataSubjectRoleName} and application ${applicationName}`)
      LOG.debug(`Data subject info, data subject IDs`, dataSubjects.map(d => d.dataSubjectId))

      //In theory there can be multiple entities for the same DataSubject or a combination of entities with a fixed or dynamic role
      const entityDefinitions = Object.values(this.entities).filter(value => (value['@PersonalData.DataSubjectRole']?.['='] || value['@PersonalData.DataSubjectRole'] === dataSubjectRoleName) && value['@PersonalData.EntitySemantics'] === 'DataSubject')
      if (entityDefinitions.length === 0) return req.error({
        code: 'DATA_SUBJECT_ROLE_NOT_FOUND',
        status: 400
      });
      const queries = []
      for (const entity of entityDefinitions) {
        const dsIDField = _getDataSubjectIDField(entity.elements)
        const where = [
          { ref: [dsIDField] },
          'in',
          { list: dataSubjects.map(d => ({ val: d.dataSubjectId })) }
        ]
        //In case the role is a path and thus dynamic. For example there could be a 
        // users entity which is used for Employees and Customers alike
        if (entity['@PersonalData.DataSubjectRole']?.['=']) {
          where.push(
            'and',
            { ref: entity['@PersonalData.DataSubjectRole']['='] },
            '=',
            { val: dataSubjectRoleName }
          )
        }
        queries.push(SELECT.from(entity).where(where).columns(
          `${dsIDField} as dataSubjectId`,
          `${_getDataSubjectNameField(entity)} as name`,
          `${_getDataSubjectEmailField(entity)} as emailId`
        ))
      }
      let result = [];
      const results = await Promise.all(queries);
      results.forEach(res => {
        result = result.concat(res);
      });
      LOG.debug(`Data subject info result`, result);
      return result;
    })

    function whereClauseForRetentionSets(referenceDates, iLMObjectEntity, dataSubjectRoleName) {
      const wheresWithCondition = []
      const wheresWithNegConditions = []

      for (const ref of referenceDates) {
        for (const orgAttrRef of ref.organizationAttributeResidenceSet) {
          for (const residenceSet of orgAttrRef.residenceSet) {
            const orgAttributeName = iLMObjectEntity.elements[orgAttrRef.organizationAttributeName] ? orgAttrRef.organizationAttributeName : _getLegalEntityIDField(iLMObjectEntity.elements)
            if (!iLMObjectEntity.elements[orgAttrRef.organizationAttributeName]) {
              LOG.warn(`data subject deletion triggered with org attribute ${orgAttrRef.organizationAttributeName} not given on entity ${iLMObjectEntity.name}. Using element ${orgAttributeName} instead.`)
            }
            const residenceSetWhere = [
              { ref: [ref.referenceDateName] },
              '<',
              { val: residenceSet.retentionStartDate },
            ]
            if (dataSubjectRoleName && iLMObjectEntity['@PersonalData.DataSubjectRole']['=']) {
              residenceSetWhere.push(
                'and',
                { ref: iLMObjectEntity['@PersonalData.DataSubjectRole']['='] },
                '=',
                { val: dataSubjectRoleName },
              )
            }
            if (orgAttributeName) {
              residenceSetWhere.push(
                'and',
                { ref: [orgAttributeName] },
                '=',
                { val: orgAttrRef.organizationAttributeValue },
              )
            } else {
              LOG.warn(`No org attribute given on the entity. Ignoring the condition: ${orgAttrRef.organizationAttributeName} = ${orgAttrRef.organizationAttributeValue}`)
            }
            const conditionWhere = whereForConditionSet(residenceSet.conditionSet)
            if (conditionWhere.length > 0) {
              LOG.debug(`Add condition in whereClauseForRetentionSets for residence set with start date ${residenceSet.retentionStartDate} `, conditionWhere)
              wheresWithCondition.push(residenceSetWhere.concat('and', conditionWhere))
              wheresWithNegConditions.push(residenceSetWhere.concat('and', 'not', { xpr: conditionWhere }))
            } else {
              wheresWithCondition.push(residenceSetWhere)
              //If we do not have a conditionSet the not case has to be a wrong condition so that this does not return the same DP, IDs
              wheresWithNegConditions.push(residenceSetWhere.concat(['and', { val: true }, '=', { val: false }]))
            }
          }
        }
      }
      const result = {
        wheresWithCondition: wheresWithCondition.reduce((acc, w) => {
          if (acc.length > 0) acc.push('or');
          acc.push({ xpr: w });
          return acc;
        }, []),
        wheresWithNegConditions: wheresWithNegConditions.reduce((acc, w) => {
          if (acc.length > 0) acc.push('or');
          acc.push({ xpr: w });
          return acc;
        }, [])
      }
      LOG.debug(`Wheres result: ${JSON.stringify(result)}`)
      return result;
    }
  }
}
