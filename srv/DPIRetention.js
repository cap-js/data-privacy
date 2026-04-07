const cds = require("@sap/cds");
const { getTranslationKey, mapCDStoRetentionDataType } = require("../lib/utils");
const LOG = cds.log("data-privacy");

module.exports = class RetentionService extends cds.ApplicationService {
  async init() {
    const { iLMObjects } = this.entities;

    this.on("READ", iLMObjects, async (req) => {
      const iLMObjects = Object.keys(this.definition._dpi.iLMObjects).reduce(
        (allILMObjects, iLMObject) => {
          const entity = this.definition._dpi.iLMObjects[iLMObject];
          //const selectionCriteria = getSelectionCriteria(entity);

          if (!entity._dpi.orgAttributeReference) {
            LOG.error(
              `${iLMObject} cannot be exposed as an iLMObject because it does not have a property annotated with @PersonalData.FieldSemantics : 'DataControllerID' or annotated with @ILM.FieldSemantics : 'LineOrganizationID'`
            );
            return allILMObjects;
          }
          if (!entity._dpi.iLMObject.endOfBusinessDates?.length) {
            LOG.error(
              `${iLMObject} cannot be exposed as an iLMObject because it does not have any property annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate'`
            );
            return allILMObjects;
          }

          const conditions = Object.keys(entity.elements).reduce((conditions, elementName) => {
            const element = entity.elements[elementName];
            if (element["@ILM.ValueHelp.Type"] === "condition") {
              const condition = {
                conditionFieldName:
                  entity.elements[elementName]["@ILM.ValueHelp.Id"] ?? elementName,
                conditionFieldType: mapCDStoRetentionDataType(element.type),
                conditionFieldDescription: cds.i18n.labels.for(element) ?? elementName,
                conditionFieldDescriptionKey: undefined,
                conditionFieldValueHelpEndPoint: element["@ILM.ValueHelp.Path"]
              };
              const labelI18nKey = getTranslationKey(element["@Common.Label"]);
              if (labelI18nKey) {
                condition.conditionFieldDescriptionKey = labelI18nKey;
              }
              conditions.push(condition);
            }
            return conditions;
          }, []);

          allILMObjects.push({
            iLMObjectName: iLMObject,
            iLMObjectType: "Transaction",
            // Mandatory property - if not given DPI crashes
            iLMObjectDescription:
              cds.i18n.labels.for(getTranslationKey(entity["@Core.Description"])) ||
              cds.i18n.labels.for(entity) ||
              `Generated description for ${entity.name}`,
            iLMObjectDescriptionKey: getTranslationKey(entity["@Core.Description"]) ?? undefined,
            iLMObjectBaseURL: buildBaseUrl(req),
            iLMObjectCheckEndPoint: `${this.path}/iLMObjects/${iLMObject}/isILMObjectEnabled`,
            organizationAttributeName:
              entity.elements[entity._dpi.orgAttributeReference]["@ILM.ValueHelp.Id"] ??
              entity._dpi.orgAttributeReference,
            referenceDates: entity._dpi.iLMObject.endOfBusinessDates,
            conditions: conditions.length ? conditions : undefined,
            dataSubjectBlockingConfiguration: {
              dataSubjectEndOfBusinessEndPoint: `${this.path}/dataSubjectEndOfBusiness`,
              dataSubjectOrganizationAttributesEndPoint: `${this.path}/dataSubjectOrganizationAttributeValues`,
              dataSubjectLastRetentionStartDatesEndPoint: `${this.path}/dataSubjectLatestRetentionStartDates`,
              dataSubjectsEndOfResidenceEndPoint: `${this.path}/dataSubjectsEndOfResidence`,
              dataSubjectsEndOfResidenceConfirmationEndPoint: `${this.path}/dataSubjectsEndOfResidenceConfirmation`,
              dataSubjectILMObjectBlockingEndPoint: `${this.path}/dataSubjectILMObjectInstanceBlocking`,
              dataSubjectsILMObjectDestroyingEndPoint: `${this.path}/dataSubjectsILMObjectInstancesDestroying`
            },
            // destructionConfiguration: {
            //   iLMObjectDestructionEndPoint: `${this.path}/destruction`,
            //   iLMObjectDestructionSimulationEndPoint: `${this.path}/simulateDestruction`,
            //   selectionCriteria: selectionCriteria
            // },
            dataSubjectRoles: entity["@PersonalData.DataSubjectRole"]["="]?.enum
              ? Object.keys(entity.elements[entity["@PersonalData.DataSubjectRole"]["="]].enum).map(
                  (ds) => ({ dataSubjectRoleName: ds })
                )
              : [
                  {
                    dataSubjectRoleName: entity["@PersonalData.DataSubjectRole"]
                  }
                ]
          });
          return allILMObjects;
        },
        []
      );
      LOG.debug("Transactional data discovery:", JSON.stringify(iLMObjects));
      req.reply(iLMObjects);
    });

    //Handle ILMObjectCheckEndpoint
    this.prepend(() =>
      this.on("READ", iLMObjects, async (req, next) => {
        if (
          req.query.SELECT.columns &&
          req.query.SELECT.columns.length === 2 &&
          req.query.SELECT.columns[0].ref?.[0] === "isILMObjectEnabled" &&
          req.query.SELECT.one &&
          req.query.SELECT.from?.ref?.[0].where?.[2]
        ) {
          const entity = this.definition._dpi.iLMObjects[req.query.SELECT.from.ref[0].where[2].val];
          if (entity["@ILM.BlockingEnabled"]?.xpr) {
            const SRV = entity["@ILM.BlockingEnabled"]._service
              ? await cds.connect.to(entity["@ILM.BlockingEnabled"]._service)
              : cds;
            const res = await SRV.run(entity["@ILM.BlockingEnabled"].xpr[0]);
            return {
              isILMObjectEnabled:
                Array.isArray(res) && res.length
                  ? res[0][Object.keys(res[0])[0]]
                  : res[Object.keys(res)[0]]
            };
          } else {
            return {
              isILMObjectEnabled: entity["@ILM.BlockingEnabled"] !== false
            };
          }
        } else {
          return next();
        }
      })
    );

    this.on("READ", this.entities["i18n-files"], async (req) => {
      const bundle = cds.i18n.bundle4(this.definition);
      const getFile = (language) => {
        let file = "";
        for (const key in bundle.defaults) {
          const translation = cds.i18n.labels.for(key, language);
          file += `${key}=${translation}\n`;
        }
        return file;
      };
      if (!req.data.file) {
        return [
          { file: "i18n.properties" },
          { file: "i18n_en.properties" },
          { file: "i18n_de.properties" },
          { file: "i18n_fr.properties" },
          { file: "i18n_es.properties" }
        ];
      }
      let file = "";
      if (req.data.file.startsWith("i18n_en")) {
        file = getFile("en");
      } else if (req.data.file.startsWith("i18n_de")) {
        file = getFile("de");
      } else if (req.data.file.startsWith("i18n_fr")) {
        file = getFile("fr");
      } else if (req.data.file.startsWith("i18n_es")) {
        file = getFile("es");
      } else {
        file = getFile("en");
      }
      req.res.set("Content-Type", "text/plain");
      req.res.set(
        "Content-disposition",
        `attachment; filename=${req.data.file ?? "i18n.properties"}`
      );
      req.res.status(200);
      req.res.end(file);
    });

    /**
     * Validations for all DPI Retention actions
     */
    this.before("*", (req) => {
      if (
        req.data.applicationName &&
        req.data.applicationName !== cds.env.requires["sap.ilm.RetentionService"].applicationName
      ) {
        return req.error({
          status: 400,
          code: "WRONG_APPLICATION_NAME",
          message: "WRONG_APPLICATION_NAME",
          target: "applicationName",
          args: [
            req.data.applicationName,
            cds.env.requires["sap.ilm.RetentionService"].applicationName
          ]
        });
      }

      if (req.data.iLMObjectName && !this.entities[req.data.iLMObjectName]) {
        return req.error(400, `The ILM object ${req.data.iLMObjectName} does not exist!`);
      } else if (req.data.iLMObjectName && this.entities[req.data.iLMObjectName]) {
        req.data.iLMObject = this.entities[req.data.iLMObjectName];
      }
    });

    return super.init();
  }
};

const buildBaseUrl = (req) => {
  let url = "";
  if (process.env.NODE_ENV === "production") url += "https://";
  url += req._req ? req._req.get("host") : req.req.get("host");
  return url;
};

// function getSelectionCriteria(entity) {
//   return Object.keys(entity.elements).reduce((selectionCriteria, elementName) => {
//     const element = entity.elements[elementName];
//     if (element['@ILM.ValueHelp.Type'] === 'selection') {
//       const type = mapCDStoRetentionDataType(element.type);
//       const nextSelectionCriteria = {
//         selectionCriteriaName: elementName,
//         selectionCriteriaDisplayName: cds.i18n.labels.for(element),
//         selectionCriteriaDisplayNameKey: undefined,
//         selectionCriteriaDescription: undefined,
//         selectionCriteriaDescriptionKey: undefined,
//         selectionCriteriaType: type, //String, Integer, Decimal, Boolean, Timestamp
//         isRangeEnabled: fieldIsAllowedForRange(elementName, type, entity),
//         selectionCriteriaValueHelpEndPoint: type !== 'Boolean' && type !== 'String' ? element['@ILM.ValueHelp.Path'] : undefined
//       }
//       const labelI18nKey = getTranslationKey(element["@Common.Label"]);
//       if (labelI18nKey) {
//         nextSelectionCriteria.selectionCriteriaDisplayNameKey = labelI18nKey
//       }
//       if (element['@Core.Description']) {
//         const descriptionI18nKey = getTranslationKey(element['@Core.Description']);
//         selectionCriteria.selectionCriteriaDescription = cds.i18n.labels.for(descriptionI18nKey) ?? element['@Core.Description']
//         if (descriptionI18nKey) {
//           selectionCriteria.selectionCriteriaDescriptionKey = descriptionI18nKey;
//         }
//       }
//       selectionCriteria.push(nextSelectionCriteria);
//     }
//     return selectionCriteria;
//   }, [])
// }

// function fieldIsAllowedForRange(field, type, entity) {
//   const filterExprRestriction = entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'] && entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'].some(restriction =>
//     restriction.Property['='] === field && restriction.AllowedExpressions === 'SingleValue'
//   ) //Range not allowed if there is a Filter Expression existing allowing only SingleValue
//   const filterRangeWanted = entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'] && entity['@Capabilities.FilterRestrictions.FilterExpressionRestrictions'].some(restriction =>
//     restriction.Property['='] === field && restriction.AllowedExpressions === 'SingleRange'
//   )
//   return filterRangeWanted || (type !== 'String' && type !== 'Boolean' && !filterExprRestriction) //by default false - should be true when Integer, Decimal, Timestamp
// }
