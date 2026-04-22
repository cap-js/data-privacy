const cds = require("@sap/cds");
const LOG = cds.log("data-privacy");

const whereForConditionSet = (conditions, iLMObject) => {
  let where = [];
  conditions.forEach((e, idx) => {
    if (idx !== 0) {
      where.push("and");
    }
    if (!iLMObject._dpi.elementByVHId(e.conditionFieldName)) {
      LOG.error(
        `Request triggered with condition field name ${e.conditionFieldName}, which does not exist on entity ${iLMObject.name}`
      );
    }
    where.push(
      {
        ref: [iLMObject._dpi.elementByVHId(e.conditionFieldName) ?? e.conditionFieldName]
      },
      "=",
      { val: e.conditionFieldValue }
    );
  });
  return where;
};

const _getDataSubjectIDField = (elements) => _getField(elements, "DataSubjectID");
const _getBlockingDateField = (elements) => _getField(elements, "BlockingDate");
const _getEndOfRetentionField = (elements) => _getField(elements, "EndOfRetentionDate");
const _getOrgAttributeIDField = (elements) => {
  for (const element in elements) {
    if (
      elements[element] &&
      (elements[element]["@PersonalData.FieldSemantics"] === "DataControllerID" ||
        elements[element]["@ILM.FieldSemantics"] === "LineOrganizationID") &&
      !elements[element].isAssociation
    )
      return element;
  }
};
const _getEndOfBusinessDateField = (elements) => _getField(elements, "EndOfBusinessDate");

const _getField = (elements, name) => {
  for (const element in elements) {
    if (
      elements[element] &&
      elements[element]["@PersonalData.FieldSemantics"] === name &&
      !elements[element].isAssociation
    )
      return element;
  }
};

const _buildWhereClauseForDS = (entity, dsID, role) => {
  const where = [{ ref: [entity._dpi.dataSubjectIdReference] }, "=", { val: dsID }];
  if (entity["@PersonalData.DataSubjectRole"]?.["="]) {
    where.push("and", { ref: entity["@PersonalData.DataSubjectRole"]["="] }, "=", { val: role });
  }
  return where;
};

const _getRoot = (entity) => {
  if (entity.query) {
    if (entity.query._target) return _getRoot(entity.query._target);
    return entity; // join/union — no single _target
  } else if (entity.projection) {
    if (entity.projection._target) return _getRoot(entity.projection._target);
    return entity;
  }
  return entity;
};

/**
 * Extract primary (leftmost) source entity name from a CSN from clause.
 * Handles simple refs, JOINs (nested args), and the from inside a UNION's first SELECT.
 * @param {object} from - CSN from clause ({ ref: [...] } or { join: ..., args: [...] })
 * @returns {string|undefined} Entity name or undefined if unresolvable
 */
const _getSourceEntity = (from) => {
  if (!from) return undefined;
  if (from.ref) return from.ref[0];
  if (from.join && from.args) return _getSourceEntity(from.args[0]);
  return undefined;
};

/**
 * Get the from clause from a CSN definition's query or projection.
 * For unions (query.SET), returns the from of the first SELECT in args.
 * @param {object} def - CSN entity definition
 * @returns {object|undefined} The from clause or undefined
 */
const _getQueryFrom = (def) => {
  if (def.query?.SELECT?.from) return def.query.SELECT.from;
  if (def.query?.SET?.args?.[0]?.SELECT?.from) return def.query.SET.args[0].SELECT.from;
  if (def.projection?.from) return def.projection.from;
  return undefined;
};

const getTranslationKey = (value) => {
  if (typeof value !== "string") return undefined;
  const result = value.match(/{i18n>(.+)}/)?.[1];
  return result && cds.env.i18n.languages !== "none" ? result : undefined;
};

function mapCDStoRetentionDataType(type) {
  switch (type) {
    case "cds.UUID":
    case "cds.String":
      return "String";
    case "cds.Integer":
    case "cds.UInt8":
    case "cds.Int16":
    case "cds.Int32":
    case "cds.Int64":
    case "cds.Integer64":
      return "Integer";
    case "cds.Decimal":
    case "cds.Double":
      return "Decimal";
    case "cds.Boolean":
      return "Boolean";
    case "cds.Timestamp":
    case "cds.Date":
    case "cds.DateTime":
      return "Timestamp";
    default:
      return null;
  }
}

function resolveCustomType(type, model) {
  if (model.definitions[type]) {
    return resolveCustomType(model.definitions[type].type, model);
  }
  return type;
}

function resolveCustomElementType(element, model) {
  if (model.definitions[element.type]) {
    return resolveCustomElementType(model.definitions[element.type], model);
  }
  return element;
}

module.exports = {
  mapCDStoRetentionDataType,
  _getDataSubjectIDField,
  _getBlockingDateField,
  _getEndOfRetentionField,
  _getOrgAttributeIDField,
  _getEndOfBusinessDateField,
  _buildWhereClauseForDS,
  whereForConditionSet,
  getTranslationKey,
  _getRoot,
  _getSourceEntity,
  _getQueryFrom,
  resolveCustomType,
  resolveCustomElementType
};
