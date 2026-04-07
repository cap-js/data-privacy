/* eslint-disable no-await-in-loop */
const cds = require("@sap/cds");
const LOG = cds.log("data-privacy");
const { _buildWhereClauseForDS, whereForConditionSet } = require("../lib/utils");

module.exports = class TableHeaderBlockingService extends require("./DPIRetention") {
  async init() {
    this.on("dataSubjectEndOfBusiness", async (req) => {
      const { applicationName, iLMObject, dataSubjectRoleName, dataSubjectId } = req.data;
      LOG.debug(
        `dataSubjectEndOfBusiness request for role ${dataSubjectRoleName} and ID ${dataSubjectId} and iLMObject ${iLMObject.name} and app ${applicationName}.`
      );
      const where = _buildWhereClauseForDS(iLMObject, dataSubjectId, dataSubjectRoleName);
      LOG.debug(`Where clause`, where);
      const result = await SELECT.one
        .from(iLMObject)
        .where(where)
        .columns(`max(${iLMObject._dpi.endOfBusinessReference}) as endOfBusiness`);
      if (!result || (result && !result.endOfBusiness)) {
        req.res.statusCode = 204; //DPI Retention defines to respond with 204 when no transactional item was found
        return;
      }
      LOG.debug(`Result of select`, result);
      const expired = new Date().toISOString() >= new Date(result.endOfBusiness).toISOString();
      const getNotExpiredReason = async (endOfBusinessDate) => {
        where.push("and", { ref: [iLMObject._dpi.endOfBusinessReference] }, "=", {
          val: endOfBusinessDate
        });
        const result2 = await SELECT.one.from(iLMObject).where(where).columns("ID");

        return `${dataSubjectRoleName} ${dataSubjectId} has a ${iLMObject.name} entity with ID ${result2.ID} which reaches end of business on ${endOfBusinessDate}`;
      };
      const response = {
        dataSubjectExpired: expired,
        dataSubjectNotExpiredReason: !expired ? await getNotExpiredReason(result.endOfBusiness) : ""
      };
      LOG.info(`dataSubjectEndOfBusiness outgoing response`, response);
      return response;
    });

    this.on("dataSubjectOrganizationAttributeValues", async (req) => {
      const {
        applicationName,
        organizationAttributeName,
        iLMObject,
        dataSubjectRoleName,
        dataSubjectId
      } = req.data;
      LOG.debug(
        `dataSubjectOrganizationAttributeValues request for the iLMObject ${iLMObject.name}, the data subject role ${dataSubjectRoleName} with the data subject ID ${dataSubjectId} and app ${applicationName} and org attribute ${organizationAttributeName}`
      );
      const where = _buildWhereClauseForDS(iLMObject, dataSubjectId, dataSubjectRoleName);
      const orgAttribute =
        iLMObject._dpi.elementByVHId(organizationAttributeName) ?? organizationAttributeName;
      LOG.debug(`where clause`, where);
      if (
        !iLMObject.elements[orgAttribute] ||
        (iLMObject.elements[orgAttribute]?.["@PersonalData.FieldSemantics"] !==
          "DataControllerID" &&
          iLMObject.elements[orgAttribute]?.["@ILM.FieldSemantics"] !== "LineOrganizationID")
      ) {
        return req.error({
          code: "ORG_ATTRIBUTE_NOT_EXISTING",
          status: 400
        });
      }
      const result = await SELECT.distinct
        .from(iLMObject)
        .where(where)
        .columns(`${orgAttribute} as organizationAttributeValue`);
      LOG.debug(`Result send to DPI for dataSubjectOrganizationAttributeValues`, result);
      return result;
    });

    this.on("dataSubjectLatestRetentionStartDates", async (req) => {
      const {
        applicationName,
        dataSubjectRoleName,
        organizationAttributeName,
        organizationAttributeValue,
        referenceDateName,
        dataSubjectId: dataSubjectID,
        iLMObject,
        retentionSet
      } = req.data;
      LOG.debug(
        `dataSubjectLatestRetentionStartDates request for the iLMObject ${iLMObject.name}, the data subject role ${dataSubjectRoleName}`,
        ` with the data subject ID ${dataSubjectID}.`,
        `Application: ${applicationName}`,
        `The reference date name field is ${referenceDateName} and the org attribute ${organizationAttributeName} with value ${organizationAttributeValue}`,
        `The retention condition set is`,
        retentionSet
      );

      const referenceDate = referenceDateName ?? iLMObject._dpi.endOfBusinessReference;
      const orgAttribute =
        iLMObject._dpi.elementByVHId(organizationAttributeName) ??
        iLMObject._dpi.orgAttributeReference;

      const queries = [];

      for (const rule of retentionSet) {
        const where = _buildWhereClauseForDS(iLMObject, dataSubjectID, dataSubjectRoleName);
        where.push(
          "and",
          { ref: [referenceDate] },
          "<=",
          { val: new Date().toISOString() },
          "and",
          { ref: [orgAttribute] },
          "=",
          { val: organizationAttributeValue }
        );
        if (rule.conditionSet.length > 0) {
          where.push("and", {
            xpr: whereForConditionSet(rule.conditionSet, iLMObject)
          });
        }
        queries.push(
          SELECT.from(iLMObject).where(where).columns(`max(${referenceDate}) as retentionStartDate`)
        );
      }

      const results = await Promise.all(queries);
      //Return 204 if no retention start dates where found, e.g. no transactional data instances were found
      if (!results.some((s) => s[0].retentionStartDate !== null)) {
        req.res.statusCode = 204;
        return;
      }

      const result = results.map((response, idx) => {
        return {
          retentionSetId: retentionSet[idx].retentionSetId,
          retentionStartDate: new Date(response[0].retentionStartDate)
            .toISOString()
            .substring(0, 19)
        };
      });
      LOG.debug(`retentionStartDate result`, result);
      return result;
    });

    this.on("dataSubjectILMObjectInstanceBlocking", async (req) => {
      const {
        applicationName,
        dataSubjectId,
        dataSubjectRoleName: dataSubjectRole,
        maxDeletionDate,
        iLMObject
      } = req.data;
      LOG.debug(
        `dataSubjectILMObjectInstanceBlocking request for the iLMObject ${iLMObject.name}, the data subject role ${dataSubjectRole}`,
        ` with the data subject ID ${dataSubjectId}.`,
        `App is ${applicationName}`,
        `The maxDeletionDate is ${maxDeletionDate}`
      );
      const where = _buildWhereClauseForDS(iLMObject, dataSubjectId, dataSubjectRole);
      LOG.info(`Where clause: `, where);
      req.user._is_privileged = true;
      const toUpdate = await this.run(
        SELECT.one
          .from(iLMObject)
          .where(where)
          .columns([{ func: "count", as: "$count", args: [{ val: 1 }] }])
      );
      //Return 204 if no records where found
      if (toUpdate.$count === 0) {
        req.res.statusCode = 204;
        return;
      }

      await this.run([
        UPDATE.entity(iLMObject)
          .where(where)
          .set({
            [iLMObject._dpi.blockingDateReference]: new Date().toISOString().substring(0, 10),
            [iLMObject._dpi.earliestDestructionDateReference]: new Date(maxDeletionDate)
              .toISOString()
              .substring(0, 10)
          }),
        ...blockCompositions(iLMObject, where)
      ]);

      req.res.status(200);
      return toUpdate.$count; //We return something because returning nothing would cause 204 and 204 means we did not find any data
    });

    this.on("dataSubjectsILMObjectInstancesDestroying", async (req) => {
      const { applicationName, dataSubjectRoleName: dataSubjectRole, iLMObject } = req.data;

      LOG.debug(
        `Destroy iLMObjects request for role ${dataSubjectRole} and iLMObject ${iLMObject.name} where end of retention is reached for app ${applicationName}.`
      );
      const whereCondition = [
        { ref: [iLMObject._dpi.earliestDestructionDateReference] },
        "<=",
        { val: new Date().toISOString().substring(0, 10) }
      ];
      if (iLMObject["@PersonalData.DataSubjectRole"]["="]) {
        whereCondition.push(
          "and",
          { ref: [iLMObject["@PersonalData.DataSubjectRole"]["="].split(".")] },
          "=",
          { val: dataSubjectRole }
        );
      }
      LOG.debug(
        `Where condition for destroy blocked ILM objects which reached end of blocking:`,
        whereCondition
      );
      req.user._is_privileged = true;
      const { amt } = await this.run(
        SELECT.one.from(iLMObject).where(whereCondition).columns("count(1) as amt")
      );
      try {
        await this.run(DELETE.from(iLMObject).where(whereCondition));
        LOG.debug(
          `Deleted ${amt} ${iLMObject} for the data subject role ${dataSubjectRole} as they reached end of blocking`
        );
      } catch (err) {
        if (err.code === 404) {
          LOG.debug(
            `Did not find any records from ${iLMObject} for the given where clause. Should have deleted ${amt} records for the data subject role ${dataSubjectRole} as they reached end of blocking`
          );
        } else {
          throw err;
        }
      }
      req.res.statusCode = 202;
    });

    this.on("dataSubjectBlocking", async (req) => {
      const { applicationName, dataSubjectRoleName, dataSubjectId, maxDeletionDate } = req.data;
      LOG.debug(
        `Block data subject request for role ${dataSubjectRoleName}, ID ${dataSubjectId} and application group ${applicationName} with end of retention ${maxDeletionDate}.`
      );
      const dsEntities = this.definition._dpi.dataSubjectsForRole(dataSubjectRoleName); //Ensures that data subject details are also retrieved
      if (dsEntities.length === 0) {
        return req.error("Non existing data subject");
      }
      //Delete if there are no active iLMObjects for the data subject
      //Active entities are the ones with no blocking date or a blocking date in the future
      for (const iLMObjectName in this.definition._dpi.iLMObjectsForRole(dataSubjectRoleName)) {
        const iLMObject = this.definition._dpi.iLMObjects[iLMObjectName];
        const wherePart1 = {
          xpr: [
            { ref: [iLMObject._dpi.blockingDateReference] },
            "is",
            "null",
            "or",
            { ref: [iLMObject._dpi.blockingDateReference] },
            ">",
            { val: new Date().toISOString().substring(0, 10) }
          ]
        };
        const wherePart2 = _buildWhereClauseForDS(iLMObject, dataSubjectId, dataSubjectRoleName);
        LOG.debug(
          `Where clause for getting active entities`,
          JSON.stringify(wherePart1),
          "and",
          wherePart2
        );
        const activeRecords = await cds.db
          .exists(iLMObject)
          .where([wherePart1, "and", { xpr: wherePart2 }]);
        if (activeRecords) {
          LOG.warn(
            `Block data subject for ${dataSubjectRoleName}, ID ${dataSubjectId} does not work due to active entities in ${iLMObject.name}.`
          );
          return req.error({
            message: "Active records still exist for the entity",
            code: 400
          });
        }
      }

      let modifiedRecords = 0;
      req.user._is_privileged = true;
      //Check if there are blocked records
      for (const singleEntity of dsEntities) {
        const where = _buildWhereClauseForDS(singleEntity, dataSubjectId, dataSubjectRoleName);
        const { amt } = await this.run(
          SELECT.one.from(singleEntity).where(where).columns("count(1) as amt")
        );
        modifiedRecords += Number(amt);
        if (new Date(maxDeletionDate).toISOString() > new Date().toISOString()) {
          await this.run([
            UPDATE.entity(singleEntity)
              .where(where)
              .set({
                [singleEntity._dpi.blockingDateReference]: new Date()
                  .toISOString()
                  .substring(0, 10),
                [singleEntity._dpi.earliestDestructionDateReference]: new Date(maxDeletionDate)
                  .toISOString()
                  .substring(0, 10)
              }),
            ...blockCompositions(singleEntity, where)
          ]);
          LOG.debug(
            `Where clause for updating ${singleEntity.name}`,
            where,
            `with blocking details. Blocked ${amt} entities.`
          );
        } else {
          try {
            await this.run(DELETE.from(singleEntity).where(where));
            LOG.debug(
              `Where clause for deleting ${singleEntity.name}`,
              where,
              `with blocking details. Deleted ${amt} entities. Delete happened on dataSubjectBlocking because maxDeletionDate was in the past/today.`
            );
          } catch (err) {
            if (err.code === 404) {
              LOG.debug(
                `Where clause for deleting ${singleEntity.name}`,
                where,
                `with blocking details. Delete returned 404 because no records were found for the where clause to be deleted. ${amt} entities should have been deleted. Delete happened on dataSubjectBlocking because maxDeletionDate was in the past/today.`
              );
            } else {
              throw err;
            }
          }
        }
      }
      return modifiedRecords;
    });

    this.on("dataSubjectsDestroying", async (req) => {
      const { applicationName, dataSubjectRoleName } = req.data;
      LOG.debug(
        `Destroy data subjects request for role ${dataSubjectRoleName} and application group ${applicationName} where end of retention is reached.`
      );
      //Delete only possible if all iLMObjects also reached end of blocking
      const dataSubjectsEntities = this.definition._dpi.dataSubjectsForRole(dataSubjectRoleName);

      //REVISIT: Support multiple entities
      const dataSubjectEntity = dataSubjectsEntities[Object.keys(dataSubjectsEntities)[0]];
      const dataSubjectIDs = await SELECT.from(dataSubjectEntity)
        .groupBy(dataSubjectEntity._dpi.dataSubjectIdReference)
        .where(
          `${dataSubjectEntity._dpi.earliestDestructionDateReference} <= '${new Date().toISOString().substring(0, 10)}'`
        )
        .columns(
          `max(${dataSubjectEntity._dpi.earliestDestructionDateReference}) as dppEarliestDestructionDate`,
          `${dataSubjectEntity._dpi.dataSubjectIdReference} as dataSubjectID`
        );
      if (dataSubjectIDs.length === 0) return;
      const dataSubjectIDsToDestroy = [];
      for (const { dataSubjectID } of dataSubjectIDs) {
        let hasActiveRecords = false;
        for (const entityName in this.definition._dpi.iLMObjects) {
          const entity = this.entities[entityName];
          if (entity && entity["@PersonalData.EntitySemantics"] === "Other") {
            if (!dataSubjectEntity._dpi.dataSubjectIdReference) continue;
            const where = [];
            where.push({ ref: [dataSubjectEntity._dpi.dataSubjectIdReference] }, "=", {
              val: dataSubjectID
            });
            //For dynamic data subject role - then it is a path.
            if (entity["@PersonalData.DataSubjectRole"]?.["="]) {
              where.push("and", { ref: entity["@PersonalData.DataSubjectRole"]["="] }, "=", {
                val: dataSubjectRoleName
              });
            } else if (entity["@PersonalData.DataSubjectRole"] !== dataSubjectRoleName) {
              LOG.debug(
                `Active records in ${entity} for data subject ${dataSubjectID} are not checked because the role ${dataSubjectRoleName} does not match the annotated role ${entity["@PersonalData.DataSubjectRole"]}`
              );
              continue;
            }
            const activeRecords = await cds.db.exists(entity).where(where);
            LOG.info(
              `Data subject ${dataSubjectID} has active records in ${entity} and cannot be destroyed`
            );
            if (activeRecords) {
              hasActiveRecords = true;
              break;
            }
          }
        }
        if (!hasActiveRecords) dataSubjectIDsToDestroy.push(dataSubjectID);
      }
      if (dataSubjectIDsToDestroy.length > 0) {
        LOG.info(`Destroy data subjects with the ID`, dataSubjectIDsToDestroy);
        req.user._is_privileged = true;
        let records = 0;
        let innerRecords = 0;
        const where = {
          [dataSubjectEntity._dpi.dataSubjectIdReference]: {
            in: dataSubjectIDsToDestroy
          },
          [dataSubjectEntity._dpi.earliestDestructionDateReference]: {
            "<=": new Date().toISOString().substring(0, 10)
          }
        };
        try {
          innerRecords = 0;
          const { amt } = await this.run(
            SELECT.one.from(dataSubjectEntity).where(where).columns("count(1) as amt")
          );
          records += amt;
          innerRecords = amt;
          await this.run(DELETE.from(dataSubjectEntity).where(where));
          LOG.debug(
            `Destroyed ${innerRecords} data subjects, with ${dataSubjectIDsToDestroy.length} data subject IDs being provided.`
          );
        } catch (err) {
          if (err.code === 404) {
            LOG.debug(
              `Failed to destroy any records. Likely due to no records being found by the where clause. Should have destroyed ${innerRecords} data subjects, with ${dataSubjectIDsToDestroy.length} data subject IDs being provided.`
            );
          } else {
            throw err;
          }
        }

        req.res.statusCode = 200;
        return `Destroyed ${records} records`;
      }
    });

    /**
     * Return the list of data subjects associated
     * with a given transactional data and data subject role for which the end of purpose has been reached.
     */
    this.on("dataSubjectsEndOfResidence", async (req) => {
      const { applicationName, iLMObject, dataSubjectRoleName, referenceDates } = req.data;
      LOG.debug(
        `Requested dataSubjectsEndOfResidence for ${dataSubjectRoleName} and iLM object ${iLMObject.name} and app ${applicationName}`,
        `Reference dates:`,
        JSON.stringify(referenceDates)
      );

      //Second condition for case that role is dynamic
      if (
        !Object.keys(this.definition._dpi.dataSubjectsForRole(dataSubjectRoleName)) &&
        !iLMObject["@PersonalData.DataSubjectRole"]["="]
      ) {
        return req.error({
          code: "DATA_SUBJECT_ROLE_NOT_EXISTING",
          status: 400
        });
      }
      const whereStmts = whereClauseForRetentionSets(
        referenceDates,
        iLMObject,
        dataSubjectRoleName
      );

      const [dataSubjectsMatchingConditions, dataSubjectsNotMatchingConditions] = await Promise.all(
        [
          SELECT.distinct
            .from(iLMObject)
            .where(whereStmts.whereWithCondition)
            .columns(
              `${iLMObject._dpi.dataSubjectIdReference} as dataSubjectId`,
              `count(1) as sumRecords`
            )
            .groupBy(iLMObject._dpi.dataSubjectIdReference)
            .orderBy(iLMObject._dpi.dataSubjectIdReference),
          SELECT.distinct
            .from(iLMObject)
            .where(whereStmts.whereWithNegConditions)
            .columns(
              `${iLMObject._dpi.dataSubjectIdReference} as dataSubjectId`,
              `count(1) as sumRecords`
            )
            .groupBy(iLMObject._dpi.dataSubjectIdReference)
        ]
      );

      LOG.debug(`Successful requests`, dataSubjectsMatchingConditions);
      LOG.debug(`nonConfirmCondition requests`, dataSubjectsNotMatchingConditions);

      return {
        success: dataSubjectsMatchingConditions.map((d) => ({
          dataSubjectId: d.dataSubjectId
        })),
        nonConfirmCondition: dataSubjectsNotMatchingConditions.map((d) => ({
          dataSubjectId: d.dataSubjectId
        }))
      };
    });

    this.on("dataSubjectsEndOfResidenceConfirmation", async (req) => {
      const {
        applicationName,
        iLMObject,
        dataSubjectRoleName,
        dataSubjects = [],
        referenceDates
      } = req.data;
      LOG.debug(
        `Requested end of residence data subject confirmation for ${dataSubjectRoleName} and iLM object ${iLMObject.name} and app ${applicationName}`,
        `Reference dates:`,
        JSON.stringify(referenceDates)
      );
      LOG.debug(`dataSubjectsEndOfResidenceConfirmation, data subject IDs`, dataSubjects);
      const dataSubjectIDs = dataSubjects.map((m) => m.dataSubjectId);

      if (dataSubjectIDs.length === 0) {
        LOG.debug(
          `No data subject IDs passed to dataSubjectsEndOfResidenceConfirmation. Early exit returning no data subjects at end of residence`
        );
        return [];
      }

      const where = [
        { ref: [iLMObject._dpi.dataSubjectIdReference] },
        "in",
        { list: dataSubjectIDs.map((d) => ({ val: d })) }
      ];

      //Second condition for case that role is dynamic
      if (
        !Object.keys(this.definition._dpi.dataSubjectsForRole(dataSubjectRoleName)) &&
        !iLMObject["@PersonalData.DataSubjectRole"]?.["="]
      ) {
        return req.error({
          code: "DATA_SUBJECT_ROLE_NOT_EXISTING",
          status: 400
        });
      }
      const { whereWithCondition } = whereClauseForRetentionSets(
        referenceDates,
        iLMObject,
        dataSubjectRoleName
      );
      const [dataSubjectsMatchingConditions, dataSubjectsForThisEntity] = await Promise.all([
        SELECT.distinct
          .from(iLMObject)
          .where(
            whereWithCondition.length
              ? where.concat("and", whereWithCondition)
              : where.concat(whereWithCondition)
          )
          .columns(
            `${iLMObject._dpi.dataSubjectIdReference} as dataSubjectId`,
            `count(1) as sumRecords`
          )
          .groupBy(iLMObject._dpi.dataSubjectIdReference)
          .orderBy(iLMObject._dpi.dataSubjectIdReference),
        SELECT.distinct
          .from(iLMObject)
          .where(where)
          .columns(
            `${iLMObject._dpi.dataSubjectIdReference} as dataSubjectId`,
            `count(1) as sumRecords`
          )
          .groupBy(iLMObject._dpi.dataSubjectIdReference)
          .orderBy(iLMObject._dpi.dataSubjectIdReference)
      ]);

      LOG.debug(`Successful requests`, dataSubjectsMatchingConditions);

      // An ILM object might not have records at all for a given data subject. Make sure that the data subjects passed to this function,
      // who do not have any records for this ILM object are again returned to mark them as eligible for blocking for this entity as they don't have any business with this entity
      const dataSubjectsAtTheEndOfResidence = dataSubjectsMatchingConditions.map((d) => ({
        dataSubjectId: d.dataSubjectId
      }));
      for (const dataSubjectID of dataSubjectIDs) {
        if (!dataSubjectsForThisEntity.some((d) => d.dataSubjectId === dataSubjectID)) {
          dataSubjectsAtTheEndOfResidence.push({
            dataSubjectId: dataSubjectID
          });
        }
      }

      return dataSubjectsAtTheEndOfResidence;
    });

    this.on("dataSubjectInformation", async (req) => {
      const { applicationName, dataSubjectRoleName, dataSubjects } = req.data;
      LOG.debug(
        `Requested data subject information for ${dataSubjectRoleName} and application ${applicationName}`
      );
      LOG.debug(
        `Data subject info, data subject IDs`,
        dataSubjects.map((d) => d.dataSubjectId)
      );

      //In theory there can be multiple entities for the same DataSubject or a combination of entities with a fixed or dynamic role
      const entityDefinitions = Object.values(this.entities).filter(
        (value) =>
          (value["@PersonalData.DataSubjectRole"]?.["="] ||
            value["@PersonalData.DataSubjectRole"] === dataSubjectRoleName) &&
          value["@PersonalData.EntitySemantics"] === "DataSubject"
      );
      if (entityDefinitions.length === 0)
        return req.error({
          code: "DATA_SUBJECT_ROLE_NOT_FOUND",
          status: 400
        });
      const queries = [];
      for (const entity of entityDefinitions) {
        const where = [
          { ref: [entity._dpi.dataSubjectIdReference] },
          "in",
          { list: dataSubjects.map((d) => ({ val: d.dataSubjectId })) }
        ];
        //In case the role is a path and thus dynamic. For example there could be a
        // users entity which is used for Employees and Customers alike
        if (entity["@PersonalData.DataSubjectRole"]?.["="]) {
          where.push("and", { ref: entity["@PersonalData.DataSubjectRole"]["="] }, "=", {
            val: dataSubjectRoleName
          });
        }
        queries.push(
          SELECT.from(entity)
            .where(where)
            .columns(
              `${entity._dpi.dataSubjectIdReference} as dataSubjectId`,
              `${entity._dpi.dataSubject.name} as name`,
              `${entity._dpi.dataSubject.email} as emailId`
            )
        );
      }
      const results = await Promise.all(queries);
      LOG.debug(`Data subject info result`, results.flat());
      return results.flat();
    });

    function whereClauseForRetentionSets(referenceDates, iLMObject, dataSubjectRoleName) {
      const whereWithCondition = [];
      const whereWithNegConditions = [];

      for (const ref of referenceDates) {
        for (const orgAttrRef of ref.organizationAttributeResidenceSet) {
          for (const residenceSet of orgAttrRef.residenceSet) {
            const orgAttributeName = iLMObject.elements[
              iLMObject._dpi.elementByVHId(orgAttrRef.organizationAttributeName)
            ]
              ? iLMObject._dpi.elementByVHId(orgAttrRef.organizationAttributeName)
              : iLMObject._dpi.orgAttributeReference;
            if (
              !iLMObject.elements[
                iLMObject._dpi.elementByVHId(orgAttrRef.organizationAttributeName)
              ]
            ) {
              LOG.warn(
                `data subject deletion triggered with org attribute ${orgAttrRef.organizationAttributeName} not given on entity ${iLMObject.name}. Using element ${orgAttributeName} instead.`
              );
            }
            const residenceSetWhere = [
              { ref: [ref.referenceDateName] },
              "<",
              { val: residenceSet.retentionStartDate }
            ];
            if (dataSubjectRoleName && iLMObject["@PersonalData.DataSubjectRole"]["="]) {
              residenceSetWhere.push(
                "and",
                { ref: iLMObject["@PersonalData.DataSubjectRole"]["="] },
                "=",
                { val: dataSubjectRoleName }
              );
            }
            if (orgAttributeName) {
              residenceSetWhere.push("and", { ref: [orgAttributeName] }, "=", {
                val: orgAttrRef.organizationAttributeValue
              });
            } else {
              LOG.warn(
                `No org attribute given on the entity. Ignoring the condition: ${orgAttrRef.organizationAttributeName} = ${orgAttrRef.organizationAttributeValue}`
              );
            }
            const conditionWhere = whereForConditionSet(residenceSet.conditionSet, iLMObject);
            if (conditionWhere.length > 0) {
              LOG.debug(
                `Add condition in whereClauseForRetentionSets for residence set with start date ${residenceSet.retentionStartDate} `,
                conditionWhere
              );
              whereWithCondition.push(residenceSetWhere.concat("and", conditionWhere));
              whereWithNegConditions.push(
                residenceSetWhere.concat("and", "not", { xpr: conditionWhere })
              );
            } else {
              whereWithCondition.push(residenceSetWhere);
              //If we do not have a conditionSet the not case has to be a wrong condition so that this does not return the same DP, IDs
              whereWithNegConditions.push(
                residenceSetWhere.concat(["and", { val: true }, "=", { val: false }])
              );
            }
          }
        }
      }
      const result = {
        whereWithCondition: whereWithCondition.reduce((acc, w) => {
          if (acc.length > 0) acc.push("or");
          acc.push({ xpr: w });
          return acc;
        }, []),
        whereWithNegConditions: whereWithNegConditions.reduce((acc, w) => {
          if (acc.length > 0) acc.push("or");
          acc.push({ xpr: w });
          return acc;
        }, [])
      };
      LOG.debug(`Where statements result: ${JSON.stringify(result)}`);
      return result;
    }

    function blockCompositions(entity, where, path = []) {
      if (!entity.compositions) {
        return [];
      }
      return Object.keys(entity.compositions).reduce((acc, comp) => {
        const backlink = Object.keys(entity.compositions[comp]._target.elements).find(
          (e) =>
            (entity.compositions[comp]._target.elements[e]._anchor?.parent.name === entity.name &&
              entity.compositions[comp]._target.elements[e]._anchor?.name === comp) ||
            e === `backlink_${comp}`
        );
        if (backlink) {
          const subSelectWhere = structuredClone(where);
          for (const ele of subSelectWhere) {
            if (ele.ref) {
              ele.ref = [backlink, ...path, ...ele.ref];
            }
          }
          acc.push(
            UPDATE.entity(entity.compositions[comp]._target)
              .where(subSelectWhere)
              .set({
                [entity.compositions[comp]._target._dpi.blockingDateReference]: new Date()
                  .toISOString()
                  .substring(0, 10)
              })
          );
          if (entity.compositions[comp]._target.compositions) {
            acc.push(
              ...blockCompositions(entity.compositions[comp]._target, where, [backlink, ...path])
            );
          }
        } else {
          LOG.error(
            `Cannot block composition ${comp} of ${entity.name} because no backlink in the composed entity was found.`
          );
        }
        return acc;
      }, []);
    }

    return super.init();
  }
};
