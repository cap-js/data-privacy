const cds = require("@sap/cds");
const LOG = cds.log("data-privacy");
const { _getRoot, mapCDStoRetentionDataType } = require("../../utils");

/**
 * Looks at the entity and registers Organization Attribute, Conditions and Selection Criteria
 * @param {string} entityName Entity name
 * @param {CSN.Entity} entity CSN of entity
 * @param {CSN} model plain CSN model
 */
module.exports = function enhanceModelWithValueLists(entityName, entity, model) {
  const options = {
    retentionService: model.definitions["sap.ilm.RetentionService"],
    entityName,
    entity,
    model
  };
  buildSelectionCriteria.bind(this)(options);
  buildConditions.bind(this)(options);
  buildOrganizationAttribute.bind(this)(options);
};

/**
 * Adds a value help view to the sap.ilm.RetentionService to act as the value help endpoint.
 * Adds the respective CSN entity to the model and sets a flag on the property to mark it as an @ILM.ValueHelp.
 * @param {*} value CSN definition of field with value help
 * @param {*} name CSN name of field for value help
 * @param {*} type //selection, condition, orgAttribute
 * @param {*} o.entityName
 * @param {*} o.entity
 * @param {*} o.model
 * @param {*} o.retentionService
 * @returns Entity definition of newly added value help entity
 */
function handleValueList(value, name, type = "selection", o) {
  LOG.debug(`Generating Value Help of type ${type} for ${name} on entity ${o.entityName}.`);
  const keyFieldName =
    type === "condition"
      ? "conditionFieldValue"
      : type === "orgAttribute"
        ? "organizationAttributeValue"
        : "value";
  const descriptionFieldName =
    type === "condition"
      ? "conditionFieldValueDescription"
      : type === "orgAttribute"
        ? "organizationAttributeValueDescription"
        : "valueDescription";
  const conditionE = structuredClone(conditionEntity);
  conditionE.elements = {
    [keyFieldName]: {
      key: true,
      type: "cds.String"
    },
    [descriptionFieldName]: {
      type: "cds.String"
    }
  };

  let VHName = null;
  if (
    Object.keys(value).some(
      (p) => p.startsWith("@Common.ValueList") && p.endsWith(".CollectionPath")
    )
  ) {
    const valueHelps = Object.keys(value).filter(
      (p) => p.startsWith("@Common.ValueList") && p.endsWith(".CollectionPath")
    );
    LOG.debug(
      `Using ${valueHelps[0]} for the value Help of type ${type} for ${name} on entity ${o.entityName}.`
    );
    const vHIdentifier = valueHelps[0].substring(0, valueHelps[0].length - 15);
    const valueField = value[vHIdentifier + ".Parameters"]
      ? value[vHIdentifier + ".Parameters"].find(
          (param) =>
            param["$Type"] === "Common.ValueListParameterInOut" ||
            param["$Type"] === "Common.ValueListParameterOut"
        )?.ValueListProperty
      : Object.entries(o.entity.keys)[0][0];
    const valueDescField = value[vHIdentifier + ".Parameters"]
      ? value[vHIdentifier + ".Parameters"]
          .filter((param) => param["$Type"] === "Common.ValueListParameterDisplayOnly")
          .reduce((acc, val) => {
            if (val && val.ValueListProperty && acc.length === 0) acc += `${val.ValueListProperty}`;
            else if (val && val.ValueListProperty) acc += `|| ', ' || ${val.ValueListProperty}`;
            return acc;
          }, "")
      : "null";
    VHName = `valueHelp_${type}_${vHIdentifier.substring(17, vHIdentifier.length).length ? vHIdentifier.substring(17, vHIdentifier.length) + "_" : ""}${value[vHIdentifier + ".CollectionPath"]}`;
    // Reflect so _target is given. stringify/parse because else o.model is mutated.
    const effectiveModel = cds.reflect(structuredClone(o.model));
    const rootEntity = _getRoot(effectiveModel.definitions[o.entityName]);
    const namespace = rootEntity.name.substring(
      0,
      rootEntity.name.length - nameOf(rootEntity).length - 1
    );
    const targetEntity =
      effectiveModel.definitions[`${namespace}.${value["@Common.ValueList.CollectionPath"]}`] ??
      effectiveModel.definitions[o.entityName].elements[
        effectiveModel.definitions[o.entityName].elements[name]._foreignKey4
      ]?._target;
    if (!targetEntity) {
      LOG.error(
        `The target "${`${namespace}.${value["@Common.ValueList.CollectionPath"]}`}" of the @Common.ValueList annotation for ${o.entityName}.${name} could not be found!`
      );
      return null;
    }
    conditionE.query = {
      SELECT: {
        from: { ref: [targetEntity.name] },
        columns: [
          {
            key: true,
            ref: [valueField],
            as: keyFieldName,
            cast: { type: "cds.String" }
          },
          valueDescField === "null"
            ? {
                xpr: [{ val: "" }],
                as: descriptionFieldName,
                cast: { type: "cds.String" }
              }
            : {
                ref: [valueDescField],
                as: descriptionFieldName,
                cast: { type: "cds.String" }
              }
        ]
      }
    };
    value["@ILM.ValueHelp.Id"] = value["@Common.ValueList.CollectionPath"];
  } else if (value.type === "cds.Association" || value.type === "cds.Composition") {
    // Case of missing ValueList annotation -> But its a relation
    VHName = `valueHelp_${type}_${value.target.replaceAll(".", "_")}`;
    const keys = value.keys.map((k) => k.ref[0]);
    const target = o.model.definitions[value.target];
    // REVISIT: HeaderInfo.Title might be edmJson leading to problems
    let descriptionField =
      target.elements[keys[0]]["@Common.Text"]?.["="] ??
      target["@UI.HeaderInfo.Title.Value"]?.["="] ??
      "null";
    conditionE.query = {
      SELECT: {
        distinct: true,
        from: { ref: [value.target] },
        columns: [
          {
            key: true,
            ref: [keys[0]],
            as: keyFieldName,
            cast: { type: "cds.String" }
          },
          descriptionField === "null"
            ? {
                xpr: [{ val: "" }],
                as: descriptionFieldName,
                cast: { type: "cds.String" }
              }
            : {
                ref: descriptionField.split("."),
                as: descriptionFieldName,
                cast: { type: "cds.String" }
              }
        ]
      }
    };
    value["@ILM.ValueHelp.Id"] = value.target;
  } else {
    // Select.distinct in case the property is neither a relation nor has a ValueHelp annotated
    VHName = `valueHelp_${type}_${o.entityName.replaceAll(".", "_")}_${name}`;
    const element = o.entity.elements[name];
    let descriptionField = element["@Common.Text"]?.["="] ?? "null";
    // Set redirection to true as we effectively expose the entity now twice
    o.model.definitions[o.entityName]["@cds.redirection.target"] = true;
    // Sets requires to override mock role ("InvalidRoleSoEntitiesCannotBeAccessedViaAPI") of underlying entity which would cause a 403
    conditionE["@requires"] = "DataRetentionManagerUser";
    conditionE.query = {
      SELECT: {
        distinct: true,
        from: { ref: [o.entityName] },
        columns: [
          {
            key: true,
            ref: [name],
            as: keyFieldName,
            cast: { type: "cds.String" }
          },
          descriptionField === "null"
            ? {
                xpr: [{ val: "" }],
                as: descriptionFieldName,
                cast: { type: "cds.String" }
              }
            : {
                ref: descriptionField.split("."),
                as: descriptionFieldName,
                cast: { type: "cds.String" }
              }
        ]
      }
    };
    value["@ILM.ValueHelp.Id"] = name;
  }
  // Ensure that entity is exposed even if underlying entity from Retention service is not
  conditionE["@cds.api.ignore"] = false;
  conditionE[`@ILM.ValueHelp.Path`] =
    `${o.retentionService.path ?? o.retentionService["@path"]}/${VHName}`;
  value[`@ILM.ValueHelp.Path`] =
    `${o.retentionService.path ?? o.retentionService["@path"]}/${VHName}`;
  value["@ILM.ValueHelp.Type"] = type;
  value["@ILM.ValueHelp.Entity"] = `${"sap.ilm.RetentionService"}.${VHName}`;
  o.model.definitions[`${"sap.ilm.RetentionService"}.${VHName}`] = conditionE;
  return conditionE;
}

/**
 *
 * @param {*} o.entityName
 * @param {*} o.entity
 * @param {*} o.model
 * @param {*} o.retentionService
 */
function buildConditions(o) {
  for (const elementName in o.entity.elements) {
    const element = o.entity.elements[elementName];
    if (
      element["@PersonalData.FieldSemantics"] === "PurposeID" ||
      element["@ILM.FieldSemantics"] === "ProcessOrganizationID"
    ) {
      handleValueList(element, elementName, "condition", o);
    }
  }
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
 * @param {*} o.entityName
 * @param {*} o.entity
 * @param {*} o.model
 * @param {*} o.retentionService
 */
function buildSelectionCriteria(o) {
  if (o.entity["@Capabilities.FilterRestrictions.Filterable"] === false) return; //Do not add Filters if the entity cannot be filtered
  for (const elementName in o.entity.elements) {
    const element = o.entity.elements[elementName];
    const type = mapCDStoRetentionDataType(element.type);
    if (
      type &&
      fieldIsAllowedForFiltering(element, o.entity) &&
      !Object.keys(element).some((k) => k.startsWith("@PersonalData.FieldSemantics")) &&
      !Object.keys(element).some((k) => k.startsWith("@ILM.FieldSemantics"))
    ) {
      handleValueList(element, elementName, "selection", o);
    }
  }
}

/**
 *
 * @param {*} o.entityName
 * @param {*} o.entity
 * @param {*} o.model
 * @param {*} o.retentionService
 * @returns
 */
function buildOrganizationAttribute(o) {
  const orgAttributes = getOrgAttributes(o.entity.elements);
  if (orgAttributes.length > 1) {
    return LOG.error(
      `${o.entityName} has multiple organization attributes configured (annotated with @PersonalData.FieldSemantics : 'DataControllerID' or @ILM.FieldSemantics : 'LineOrganizationID'! Only one attribute is allowed!`
    );
  }
  if (orgAttributes.length === 0) {
    return LOG.error(
      `${o.entityName} has no organization attributes configured (annotated with @PersonalData.FieldSemantics : 'DataControllerID' or @ILM.FieldSemantics : 'LineOrganizationID'! One attribute is required to configure the entity as an ILMObject for Data Privacy Retention Management!`
    );
  }
  const orgAttributeName = orgAttributes[0];
  const orgAttributeDefinition = handleValueList(
    o.entity.elements[orgAttributeName],
    orgAttributeName,
    "orgAttribute",
    o
  );

  const existingOrgAttributes = Object.keys(o.model.definitions)
    .filter((n) => n.startsWith(`sap.ilm.RetentionService.valueHelp_orgAttribute`))
    .map((def) => o.model.definitions[def]);
  if (
    existingOrgAttributes.some(
      (o) =>
        o["@ILM.OrganizationAttributeName"] === orgAttributeName &&
        o["@ILM.ValueHelpPath"] !== orgAttributeDefinition["@ILM.ValueHelpPath"]
    )
  ) {
    const existingAttribute = existingOrgAttributes.find(
      (o) =>
        o.organizationAttributeName === orgAttributeName &&
        o.organizationAttributeValueHelpEndPoint !== orgAttributeDefinition["@ILM.ValueHelpPath"]
    );
    LOG.warn(
      `Organisational attributes require unique organizationAttributeName properties! Tried to register another attribute for the name ${orgAttributeName} now from ${o.entity.name} with the generated value help endpoint ${orgAttributeDefinition["@ILM.ValueHelpPath"]} deviating from the existing registered attribute with the value help endpoint ${existingAttribute["@ILM.ValueHelpPath"]}`
    );
  }
  orgAttributeDefinition["@ILM.OrganizationAttributeName"] =
    o.entity.elements[orgAttributeName]["@ILM.ValueHelp.Id"];
  orgAttributeDefinition["@Common.Label"] = o.entity.elements[orgAttributeName]["@Common.Label"];
}

function getOrgAttributes(elements) {
  const orgAttributes = [];
  for (const element in elements) {
    if (
      elements[element] &&
      (elements[element]["@PersonalData.FieldSemantics"] === "DataControllerID" ||
        elements[element]["@ILM.FieldSemantics"] === "LineOrganizationID") &&
      !elements[element].isAssociation
    ) {
      orgAttributes.push(element);
    }
  }
  return orgAttributes;
}

const conditionEntity = {
  kind: "entity",
  "@readonly": true,
  //Null EntitySemantics and DataSubjectRole so that the annotations are not inherited from the underlying actual DataSubject / ILMObject entity
  "@PersonalData.EntitySemantics": null,
  "@PersonalData.DataSubjectRole": null,
  "@Capabilities.DeleteRestrictions.Deletable": false,
  "@Capabilities.InsertRestrictions.Insertable": false,
  "@Capabilities.UpdateRestrictions.Updatable": false
};

const nameOf = (entity, eName) =>
  entity.name
    ? entity.name.split(".")[entity.name.split(".").length - 1]
    : eName
      ? eName.split(".")[eName.split(".").length - 1]
      : null;

function fieldIsAllowedForFiltering(field, entity) {
  return (
    (!(
      entity["@Capabilities.FilterRestrictions.NonFilterableProperties"] &&
      entity["@Capabilities.FilterRestrictions.NonFilterableProperties"].some(
        (restriction) => restriction["="] === field.name
      )
    ) &&
      !field["@UI.HiddenFilter"] &&
      !field["@UI.Hidden"] &&
      !field.key &&
      field["@PersonalData.FieldSemantics"] !== "EndOfBusinessDate" &&
      (!entity["@UI.SelectionFields"] ||
        (entity["@UI.SelectionFields"] &&
          entity["@UI.SelectionFields"].some(
            (selectionField) => selectionField["="] === field.name
          )))) ||
    (entity["@Capabilities.FilterRestrictions.RequiredProperties"] &&
      entity["@Capabilities.FilterRestrictions.RequiredProperties"].some(
        (selectionField) => selectionField["="] === field.name
      ))
  );
}
