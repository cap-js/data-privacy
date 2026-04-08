const cds = require("@sap/cds");
const { resolveCustomType, resolveCustomElementType } = require("../../utils");
const LOG = cds._dpi.log("data-privacy");

/**
 * Validates the entity to ensure all necessary fields are given for the data privacy integration to work
 * @param {string} entityName CSN entity name
 * @param {*} m CSN
 */
function entityValidation(entityName, m, DPI_SERVICES) {
  const entity = m.definitions[entityName];

  // Ensure EntitySemantics and DataSubjectRole are always both annotated and cannot exists without each other
  if (
    entity["@PersonalData.EntitySemantics"] &&
    !entity["@PersonalData.DataSubjectRole"] &&
    firstEntityWithAnnotation(entityName, "@PersonalData.EntitySemantics", m)
  ) {
    LOG.error(
      `${entityName} is annotated with @PersonalData.EntitySemantics but is lacking the @PersonalData.DataSubjectRole annotation!`
    );
  } else if (
    !entity["@PersonalData.EntitySemantics"] &&
    entity["@PersonalData.DataSubjectRole"] &&
    firstEntityWithAnnotation(entityName, "@PersonalData.DataSubjectRole", m)
  ) {
    LOG.error(
      `${entityName} is annotated with @PersonalData.DataSubjectRole but is lacking the @PersonalData.EntitySemantics annotation!`
    );
  }

  // Ensure that the dynamic data subject role can be resolved
  if (
    entity["@PersonalData.DataSubjectRole"] &&
    firstEntityWithAnnotation(entityName, "@PersonalData.DataSubjectRole", m) &&
    typeof entity["@PersonalData.DataSubjectRole"] !== "string"
  ) {
    if (entity["@PersonalData.DataSubjectRole"]?.["="]) {
      const segments = entity["@PersonalData.DataSubjectRole"]["="].split(".");
      let currentEntity = entityName;
      let currentElement = null;
      for (const segment of segments) {
        currentElement = m.definitions[currentEntity].elements[segment];
        if (!currentElement) {
          LOG.error(
            `Cannot resolve the @PersonalData.DataSubjectRole path "${entity["@PersonalData.DataSubjectRole"]["="]}" of ${entityName}. Cannot find ${segment} in ${currentEntity}!`
          );
          break;
        } else if (currentElement.cardinality?.max === "*") {
          LOG.error(
            `Cannot resolve the @PersonalData.DataSubjectRole path "${entity["@PersonalData.DataSubjectRole"]["="]}" of ${entityName}. "${segment}" is a to many relation, which cannot be used!`
          );
          break;
        }
        currentEntity = currentElement.target;
      }
      if (!currentElement) {
        LOG.error(
          `Cannot resolve the @PersonalData.DataSubjectRole path "${entity["@PersonalData.DataSubjectRole"]["="]}" of ${entityName}.`
        );
      } else if (!resolveCustomElementType(currentElement, m).enum) {
        LOG.error(
          `The @PersonalData.DataSubjectRole path "${entity["@PersonalData.DataSubjectRole"]["="]}" of ${entityName} does not point to an enum property. Dynamic role properties must have an enum assigned detailing all possible roles!`
        );
      }
    } else {
      LOG.error(
        `Cannot resolve the @PersonalData.DataSubjectRole of ${entityName}. Please use a path to a property or a static string value. Expressions are not allowed!`
      );
    }
  }

  // Ensure that compositions of a data subject are marked as data subject details
  if (entity["@PersonalData.EntitySemantics"] === "DataSubject") {
    const entitiesToCheck = [{ dataSubject: entityName, entityName: entityName, path: [] }];
    do {
      const toCheck = entitiesToCheck.pop();
      const toCheckEntity = m.definitions[toCheck.entityName];
      for (const k in toCheckEntity.elements) {
        const element = resolveCustomElementType(toCheckEntity.elements[k], m);
        if (element.type === "cds.Composition" && element.target) {
          entitiesToCheck.push({
            dataSubject: toCheck.dataSubject,
            entityName: element.target,
            path: toCheck.path.concat(k)
          });
          if (
            m.definitions[element.target]?.["@PersonalData.EntitySemantics"] !==
            "DataSubjectDetails"
          ) {
            LOG.warn(
              `The composition ${toCheck.path.concat(k).join(".")} of the data subject ${toCheck.dataSubject} points to ${element.target}. ${element.target} is however not annotated with '@PersonalData.EntitySemantics': 'DataSubjectDetails'. This is a modelling bad-practice as all compositions of a data subject should be considered as data subject details.`
            );
          }
        }
      }
    } while (entitiesToCheck.length > 0);
  }

  // Ensure that compositions do not point to the same entity
  if (
    entity["@PersonalData.EntitySemantics"] === "DataSubject" ||
    entity["@PersonalData.EntitySemantics"] === "Other"
  ) {
    const entitiesToCheck = [{ dataSubject: entityName, entityName: entityName, path: [] }];
    do {
      const toCheck = entitiesToCheck.pop();
      const toCheckEntity = m.definitions[toCheck.entityName];
      const alreadyVisitedTargets = [];
      for (const k in toCheckEntity.elements) {
        const element = resolveCustomElementType(toCheckEntity.elements[k], m);
        if (element.type === "cds.Composition" && element.target) {
          entitiesToCheck.push({
            dataSubject: toCheck.dataSubject,
            entityName: element.target,
            path: toCheck.path.concat(k)
          });
          if (alreadyVisitedTargets.some((target) => target === element.target)) {
            LOG.warn(
              `The composition ${toCheck.path.concat(k).join(".")} of the data-privacy relevant entity ${toCheck.dataSubject} points to ${element.target}. However another composition in the same entity point to that as well. The plugin currently requires that multiple compositions cannot point to the same entity! Please change one of the compositions to an association or use separate entities.`
            );
          }
          alreadyVisitedTargets.push(element.target);
        }
      }
    } while (entitiesToCheck.length > 0);
  }

  if (entity["@ILM.ObjectName"] && typeof entity["@ILM.ObjectName"] !== "string") {
    LOG.error(`Only string value are allowed for @ILM.ObjectName on ${entityName}!`);
  }
  if (
    entity["@ILM.ObjectName"] &&
    !entity["@PersonalData.EntitySemantics"] === "Other" &&
    !entity["@ILM.BlockingEnabled"] &&
    !entity["@ILM.ArchivingEnabled"]
  ) {
    LOG.warn(
      `@ILM.ObjectName on ${entityName} is ignored because ${entityName} is not marked as an ILM Object! Annotate the entity with @PersonalData.EntitySemantics = 'Other', @ILM.ArchivingEnabled or @ILM.BlockingEnabled for that.`
    );
  }

  if (
    entity["@PersonalData.EntitySemantics"] === "Other" &&
    // Only validate the properties of the service lvl entities to ensure that in a scenario where the
    // base entity is extend in the service it does not crash beforehand
    Object.keys(DPI_SERVICES).some((srv) => entityName.startsWith(srv))
  ) {
    if (
      !Object.keys(entity.elements).some(
        (e) => entity.elements[e]["@PersonalData.FieldSemantics"] === "EndOfBusinessDate"
      )
    ) {
      LOG.error(
        `${entityName} is lacking a property annotated with @PersonalData.FieldSemantics : 'EndOfBusinessDate'. This is necessary to determine from when on the entity must be blocked and later destructed.`
      );
    }

    const dsIDProperties = Object.keys(entity.elements).filter(
      (e) => entity.elements[e]["@PersonalData.FieldSemantics"] === "DataSubjectID"
    );
    if (!dsIDProperties.length) {
      LOG.error(
        `${entityName} is lacking a property annotated with @PersonalData.FieldSemantics : 'DataSubjectID'. This is necessary to determine to which data subject the records belong.`
      );
    }
    if (dsIDProperties.length > 1) {
      LOG.error(
        `${entityName} is has multiple properties annotated with @PersonalData.FieldSemantics : 'DataSubjectID'. Only one is allowed! This is necessary to correctly determine to which data subject the records belong.`
      );
    }
  }
  for (const k in entity.elements) {
    // 1. Ensure there is no semantic annotation overlap on any property, which would be an ambiguous model
    if (
      Object.keys(entity.elements[k]).filter((k) => k.startsWith("@PersonalData.FieldSemantics"))
        .length > 1 &&
      firstElementWithAnnotation(entityName, k, "@PersonalData.FieldSemantics", m)
    ) {
      LOG.error(
        `${k} of ${entityName} has multiple @PersonalData.FieldSemantics annotations. Only one is allowed!`
      );
    }
    if (
      firstElementWithAnnotation(entityName, k, "@ILM.FieldSemantics", m) &&
      !!entity.elements[k]["@PersonalData.FieldSemantics"] &&
      entity.elements[k]["@PersonalData.FieldSemantics"] !== "DataControllerID" &&
      entity.elements[k]["@ILM.FieldSemantics"] === "LineOrganizationID"
    ) {
      LOG.error(
        `${k} of ${entityName} is annotated with @ILM.FieldSemantics : 'LineOrganizationID' but also a conflicting @PersonalData.FieldSemantics annotation! Please remove either of them!`
      );
    }
    if (
      firstElementWithAnnotation(entityName, k, "@ILM.FieldSemantics", m) &&
      !!entity.elements[k]["@PersonalData.FieldSemantics"] &&
      entity.elements[k]["@PersonalData.FieldSemantics"] !== "PurposeID" &&
      entity.elements[k]["@ILM.FieldSemantics"] === "ProcessOrganizationID"
    ) {
      LOG.error(
        `${k} of ${entityName} is annotated with @ILM.FieldSemantics : 'ProcessOrganizationID' but also a conflicting @PersonalData.FieldSemantics annotation! Please remove either of them!`
      );
    }

    // 2. Ensure data types are as expected
    if (
      firstElementWithAnnotation(entityName, k, "@PersonalData.FieldSemantics", m) &&
      entity.elements[k]["@PersonalData.FieldSemantics"] in fieldRequiringDateType &&
      !(resolveCustomType(entity.elements[k].type, m) in dateTypes)
    ) {
      LOG.error(
        `${k} of ${entityName} is annotated with @PersonalData.FieldSemantics : '${entity.elements[k]["@PersonalData.FieldSemantics"]}' but the data type (${resolveCustomType(entity.elements[k].type, m)}) does not match one of the required data types: ${Object.keys(dateTypes).join(", ")}`
      );
    }
    if (
      firstElementWithAnnotation(entityName, k, "@PersonalData.FieldSemantics", m) &&
      entity.elements[k]["@PersonalData.FieldSemantics"] in personalDataFieldsForReference &&
      resolveCustomType(entity.elements[k].type, m) in unsupportedDataTypesForFieldReferences
    ) {
      LOG.error(
        `The data type (${resolveCustomType(entity.elements[k].type, m)}) of ${k} of ${entityName} is not supported for @PersonalData.FieldSemantics : '${entity.elements[k]["@PersonalData.FieldSemantics"]}'! Unsupported data types: ${Object.keys(unsupportedDataTypesForFieldReferences).join(", ")}`
      );
    }
    if (
      firstElementWithAnnotation(entityName, k, "@ILM.FieldSemantics", m) &&
      entity.elements[k]["@ILM.FieldSemantics"] in ilmFieldsForReference &&
      resolveCustomType(entity.elements[k].type, m) in unsupportedDataTypesForFieldReferences
    ) {
      LOG.error(
        `The data type (${resolveCustomType(entity.elements[k].type, m)}) of ${k} of ${entityName} is not supported for @ILM.FieldSemantics : '${entity.elements[k]["@ILM.FieldSemantics"]}'! Unsupported data types: ${Object.keys(unsupportedDataTypesForFieldReferences).join(", ")}`
      );
    }

    // REVISIT: This check only exists because cap-js/audit-logging auto-marks entities with EntitySemantics = 'Other' when they have an association to a DataSubject
    if (
      (entity.elements[k].type === "cds.Association" ||
        entity.elements[k].type === "cds.Composition") &&
      m.definitions[entity.elements[k].target]?.["@PersonalData.EntitySemantics"] ===
        "DataSubject" &&
      !entity["@PersonalData.EntitySemantics"] &&
      // Only on base entities
      !entity.query &&
      !entity.projection
    ) {
      LOG.error(
        `${entityName} has an association "${k}" to a data subject ${entity.elements[k].target} but is not marked as transactional data!`
      );
    }
  }
}

const fieldRequiringDateType = {
  EndOfBusinessDate: 1,
  EndOfRetentionDate: 1,
  BlockingDate: 1
};
const dateTypes = { "cds.Date": 1, "cds.DateTime": 1, "cds.Timestamp": 1 };

const personalDataFieldsForReference = {
  DataSubjectID: 1,
  PurposeID: 1,
  DataControllerID: 1
};
const ilmFieldsForReference = {
  LineOrganizationID: 1,
  ProcessOrganizationID: 1
};
const unsupportedDataTypesForFieldReferences = {
  "cds.LargeBinary": 1,
  "cds.Binary": 1,
  "cds.Date": 1,
  "cds.DateTime": 1,
  "cds.Timestamp": 1,
  "cds.Map": 1,
  "cds.LargeString": 1
};

module.exports = {
  entityValidation
};

function firstEntityWithAnnotation(entityName, annotation, model) {
  const entity = model.definitions[entityName];
  const cqn = entity.query?.SELECT ?? entity.projection;
  if (!cqn) {
    return true;
  }
  const parent = model.definitions[cqn.from.ref[0]];
  if (!parent || !parent[annotation]) {
    return true;
  }
  return JSON.stringify(parent[annotation]) !== JSON.stringify(entity[annotation]);
}

function firstElementWithAnnotation(entityName, elementName, annotation, model) {
  const entity = model.definitions[entityName];
  const cqn = entity.query?.SELECT ?? entity.projection;
  if (!cqn) {
    return true;
  }

  const parentElementRef = cqn.columns?.find((c) => c.ref && c.as && c.as === elementName)?.ref ?? [
    elementName
  ];

  let currentEntity = model.definitions[cqn.from.ref[0]];
  let currentParentElement = null;
  for (const ele of parentElementRef) {
    currentParentElement = currentEntity?.elements[ele];
    if (currentParentElement?.target) {
      currentEntity = model.definitions[currentParentElement.target];
    }
  }

  if (!currentParentElement?.[annotation]) {
    return true;
  }
  return (
    JSON.stringify(currentParentElement?.[annotation]) !==
    JSON.stringify(entity.elements[elementName]?.[annotation])
  );
}
