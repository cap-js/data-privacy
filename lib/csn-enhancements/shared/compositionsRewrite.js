const cds = require("@sap/cds");
const LOG = cds._dpi.log("data-privacy");

const {
  _getOrgAttributeIDField,
  _getDataSubjectIDField,
  _getEndOfBusinessDateField,
  _getSourceEntity,
  _getQueryFrom,
  resolveCustomElementType,
  getCompEntityName
} = require("../../utils");
const { assignInformationAnnotations } = require("../information/enhanceAnnotations");

// 20 is an arbitrary value chosen with the expectation that even unusual modelling would not go past it
const _maxDepth = () => cds.env.requires["sap.ilm.RetentionService"]?.maxProjectionDepth ?? 20;

/**
 * Check if parent is the same entity as target or a projection on target.
 */
function _isOrProjectsOn(parent, target, model) {
  let current = parent;
  let depth = 0;
  while (current) {
    if (++depth > _maxDepth()) {
      LOG.error(
        `Exceeded maximum projection depth (${_maxDepth()}) while checking backlink for ${parent}. Possible circular projection. Increase via cds.requires["sap.ilm.RetentionService"].maxProjectionDepth.`
      );
      return false;
    }
    if (current === target) return true;
    const def = model.definitions[current];
    if (!def) return false;
    current = _getSourceEntity(_getQueryFrom(def));
  }
  return false;
}

const hasBacklink = (elements, parent, model) =>
  Object.values(elements).some((e) => e.target && _isOrProjectsOn(parent, e.target, model));
const backlink = (elements, parent, model) =>
  Object.entries(elements).find(([, e]) => e.target && _isOrProjectsOn(parent, e.target, model))[0];

const fieldsFn = {
  legalID: _getOrgAttributeIDField,
  dsID: _getDataSubjectIDField,
  eob: _getEndOfBusinessDateField
};
const compCondition = (name, comp, backLinkName) => {
  if (comp.on && backLinkName) {
    return structuredClone(comp.on).reduce((acc, val) => {
      if (val.ref) {
        if (val.ref[0] === name) {
          val.ref.shift();
        } else {
          val.ref = [backLinkName, ...val.ref];
        }
      }
      acc.push(val);
      return acc;
    }, []);
  } else if (comp.keys && backLinkName) {
    return structuredClone(comp.keys).reduce((acc, val) => {
      if (acc.length > 0) {
        acc.push("and");
      }
      acc.push({ ref: [val.ref[0]] }, "=", { ref: [backLinkName, name, val.ref[0]] });
      return acc;
    }, []);
  } else if (comp.on) {
    return comp.on;
  } else if (comp.keys) {
    return structuredClone(comp.keys).reduce((acc, val) => {
      if (acc.length > 0) {
        acc.push("and");
      }
      acc.push(
        { ref: [name, val.ref[0]] },
        "=",
        { ref: ["$self", `${name}_${val.ref[0]}`] } //REVISIT if it has to be . or _
      );
      return acc;
    }, []);
  }
};

/**
 * Builds mixin fields for a composition target entity.
 * @param {object} params
 * @param {object} params.entity - The resolved composition target entity definition
 * @param {string} params.fullName - Fully qualified name of the parent entity
 * @param {string} params.backLinkName - Name of the backlink association
 * @param {string} params.parentName - Short name of the parent entity
 * @param {object} params.o - Options object (dppServiceName, redirectForParent, etc.)
 * @param {string} params.compName - Name of the composition element
 * @param {object} params.comp - The resolved composition element
 * @returns {{mixin, excluding}} The additional mixin fields
 */
function buildMixinFields({
  entity,
  fullName,
  backLinkName,
  parentName,
  compName,
  comp,
  o,
  model
}) {
  const mixin = {};
  const excluding = [];

  if (!hasBacklink(entity.elements, fullName, model)) {
    mixin[backLinkName] = {
      type: "cds.Association",
      target: o.dppServiceName + "." + parentName,
      cardinality: { max: 1 },
      on: compCondition(compName, comp, backLinkName)
    };
  }
  if (o.redirectForParent) {
    mixin[backLinkName] = {
      type: "cds.Association",
      target: o.dppServiceName + "." + parentName,
      cardinality: { max: 1 },
      on: compCondition(backLinkName, entity.elements[backLinkName])
    };
  }
  if (o.redirectForParent) {
    excluding.push(backLinkName);
  }
  if (!hasBacklink(entity.elements, fullName, model)) {
    //In that case the children need to rewrite backlink and hence comp needs to be mixed in
    const children = Object.entries(entity.elements).filter(
      ([, e]) => e.type === "cds.Composition"
    ); //REVISIT: Possible problem if one hides the composition behind a custom type
    for (const [cname, child] of children) {
      excluding.push(cname);
      mixin[cname] = {
        type: "cds.Composition",
        target: child.target,
        cardinality: child.cardinality && child.cardinality.max == "1" ? { max: 1 } : { max: "*" },
        on: compCondition(cname, child)
      };
    }
  }
  return { mixin, excluding };
}

/**
 * Builds the SELECT columns for a composition target entity.
 * @param {object} params
 * @param {string} params.backLinkName - Name of the backlink association
 * @param {object} params.parentDefinition - The parent entity definition
 * @param {object} params.entity - The resolved composition target entity definition
 * @param {object} params.comp - The resolved composition element
 * @param {object} params.newEntity - The new entity being built (elements are mutated)
 * @param {object} params.dsFields - Data subject fields from options
 * @param {boolean} params.redirectForParent - Whether to redirect for the parent
 * @param {object} params.newDsFields - Mutable data subject fields object (mutated)
 * @param {string[]} params.mixinFieldsToExclude - Field names to exclude
 * @param {string[]} params.semanticKeys - Semantic key names from parent definition
 * @param {string} params.parentName - Short name of the parent entity
 * @returns {Array} The SELECT columns array
 */
function buildColumns({
  backLinkName,
  parentDefinition,
  entity,
  comp,
  newEntity,
  dsFields,
  redirectForParent,
  newDsFields,
  mixinFieldsToExclude,
  semanticKeys,
  parentName
}) {
  const additionalFields = ["*", { ref: [backLinkName] }];
  const formatter = (f) => {
    return {
      ref: [backLinkName, ...f.split(".")],
      as: `${backLinkName}_${f.replace(".", "_")}`
    };
  };
  //Add keys and semantic keys - label ID keys as "<entity> ID"
  //Don't render foreign keys
  additionalFields.push(
    ...Object.entries(parentDefinition.elements)
      .filter(
        ([n, e]) =>
          e.key &&
          !entity.elements[`${backLinkName}_${n}`] &&
          comp.on &&
          !comp.on.some((o) => o.ref && o.ref[0] === n) &&
          (!entity.elements[backLinkName] ||
            (entity.elements[backLinkName].keys &&
              !entity.elements[backLinkName].keys.some((k) => k.ref[0] === n)))
      )
      .map(([n]) => {
        let r = formatter(n);
        newEntity.elements[r.as] = parentDefinition.elements[n];
        if (n === "ID") {
          newEntity.elements[r.as]["@Common.Label"] = `${parentName} ID`;
        }
        return r;
      })
  );
  additionalFields.push(
    ...semanticKeys.map((n) => {
      const newField = formatter(n);
      newEntity.elements[newField.as] = parentDefinition.elements[n];
      return newField;
    })
  );
  //Add privacy related fields
  for (const field in dsFields) {
    if (fieldsFn[field](entity.elements)) {
      newDsFields[field] = fieldsFn[field](entity.elements);
    }
    //last check in case managed association is such a field already
    else if (
      typeof dsFields[field] !== "function" &&
      dsFields[field] &&
      !additionalFields.some(
        (a) =>
          a?.as === formatter(dsFields[field]).as ||
          (a?.ref &&
            a?.ref.join(".") === backLinkName &&
            entity.elements[backLinkName] &&
            entity.elements[backLinkName].keys.some((k) => k.ref[0] === dsFields[field]))
      )
    ) {
      const newField = formatter(dsFields[field]);
      newEntity.elements[newField.as] =
        parentDefinition.elements[dsFields[field].replaceAll(".", "_")];
      additionalFields.push(newField);
      newDsFields[field] =
        !redirectForParent && entity.elements[backLinkName]
          ? `${backLinkName}.${dsFields[field]}`
          : `${backLinkName}_${dsFields[field]}`;
    }
  }
  //Add keys to select for mixin
  if (redirectForParent && entity.elements[backLinkName] && entity.elements[backLinkName].keys) {
    entity.elements[backLinkName].keys.forEach((k) => {
      const f = formatter(k.ref[0]);
      if (!additionalFields.some((a) => a === f)) {
        additionalFields.push(f);
        newEntity.elements[f.as] = parentDefinition.elements[k.ref[0]];
      }
    });
  }
  //Add to exclude fields if not already present, to ensure that mixed in fields are used
  mixinFieldsToExclude.forEach((f) => {
    if (!additionalFields.some((addField) => addField.ref && addField.ref.join(".") === f)) {
      additionalFields.push({ ref: f.split(".") });
    }
  });
  return additionalFields;
}

function checkRequiredAnnotations(entityName, entity) {
  const dsIDField = _getDataSubjectIDField(entity.elements);
  if (!dsIDField) {
    LOG.error(
      `${entityName} has no field marked with @PersonalData.FieldSemantics : 'DataSubjectID'. Please expose the data subject ID!`
    );
  }
  if (!entity["@PersonalData.DataSubjectRole"]) {
    LOG.error(
      `${entityName} is not annotated with @PersonalData.DataSubjectRole. Please add @PersonalData.DataSubjectRole!`
    );
  }
  if (!entity["@PersonalData.EntitySemantics"]) {
    LOG.error(
      `${entityName} is not annotated with @PersonalData.EntitySemantics. Please add @PersonalData.EntitySemantics!`
    );
  }
}

function exposeCompositionsWithRewrites(
  fullName,
  parentDefinition,
  m,
  o = {
    dsFields: undefined,
    redirectForParent: false,
    entities: {},
    dppServiceName: null,
    assignInformationAnnotations: true,
    exposeEntities: true,
    rmCompsToTransactionalRecords: false
  }
) {
  let result = {};
  const compositions = Object.keys(parentDefinition.elements).filter((elementName) => {
    const resolvedElement = resolveCustomElementType(parentDefinition.elements[elementName], m);
    return (
      resolvedElement.type === "cds.Composition" &&
      // Do not consider any compositions to entities which are marked with @PersonalData.EntitySemantics : 'Other' within the comp hierarchy if setting is given
      // This is important because these entities are considered ILM Root nodes and should not appear in any other entity tree
      (!o.rmCompsToTransactionalRecords ||
        m.definitions[resolvedElement.target]["@PersonalData.EntitySemantics"] !== "Other")
    );
  });

  if (compositions.length > 0) {
    for (const compName of compositions) {
      const comp = resolveCustomElementType(parentDefinition.elements[compName], m);

      const entity = m.definitions[comp.target];
      const entityName = getCompEntityName(comp.target, fullName, m);

      const newFullyQualifiedName = o.dppServiceName + "." + entityName;
      o.entities[comp.target] = newFullyQualifiedName;
      const newDsFields = { ...o.dsFields };

      const entityAlreadyExposed = !!m.definitions[newFullyQualifiedName];
      const newEntity = m.definitions[newFullyQualifiedName] ?? structuredClone(entity);

      if (entityAlreadyExposed) {
        //If it is already exposed just check that annotations are given
        checkRequiredAnnotations(entityName, newEntity);
      } else {
        createNewComposedEntity(
          { comp, entity, fullName, compName, newDsFields, newEntity, parentDefinition },
          o,
          m
        );
        result[newFullyQualifiedName] = newEntity;
      }

      //REVISIT - does not add deeper than 1 level as added backlinks cannot be referenced in deeper comps
      Object.assign(
        result,
        exposeCompositionsWithRewrites(comp.target, newEntity, m, {
          dsFields: newDsFields,
          redirectForParent: !hasBacklink(entity.elements, fullName, m),
          entities: o.entities,
          dppServiceName: o.dppServiceName,
          exposeEntities: o.exposeEntities,
          assignInformationAnnotations: o.assignInformationAnnotations,
          rmCompsToTransactionalRecords: o.rmCompsToTransactionalRecords
        })
      );
    }
  }
  return result;
}

function createNewComposedEntity(
  { comp, compName, parentDefinition, newEntity, entity, fullName, newDsFields },
  o,
  m
) {
  if (newEntity.includes) delete newEntity.includes;
  const semanticKeys = parentDefinition["@Common.SemanticKey"]
    ? parentDefinition["@Common.SemanticKey"].map((m) => m["="])
    : [];
  const parentName = fullName.split(".")[fullName.split(".").length - 1];
  let backLinkName = hasBacklink(entity.elements, fullName, m)
    ? backlink(entity.elements, fullName, m)
    : `backlink_${compName}`;
  const { excluding, mixin } = buildMixinFields({
    entity,
    fullName,
    backLinkName,
    parentName,
    compName,
    comp,
    o,
    model: m
  });
  newEntity.query = {
    SELECT: {
      from: { ref: [comp.target] },
      columns: buildColumns({
        backLinkName,
        parentDefinition,
        entity,
        comp,
        newEntity,
        dsFields: o.dsFields,
        redirectForParent: o.redirectForParent,
        newDsFields,
        mixinFieldsToExclude: excluding,
        semanticKeys,
        parentName
      }) //columns has to run before annotations so the references of dsFields are correct
    }
  };
  if (Object.keys(mixin).length > 0) {
    newEntity.query.SELECT.mixin = mixin;
    Object.assign(newEntity.elements, mixin);
  }
  if (excluding.length > 0) {
    newEntity.query.SELECT.excluding = excluding;
  }

  if (o.assignInformationAnnotations) {
    if (!newEntity["@PersonalData.DataSubjectRole"])
      newEntity["@PersonalData.DataSubjectRole"] =
        parentDefinition["@PersonalData.DataSubjectRole"];
    if (!newEntity["@PersonalData.EntitySemantics"])
      newEntity["@PersonalData.EntitySemantics"] =
        parentDefinition["@PersonalData.EntitySemantics"];
    Object.assign(newEntity, assignInformationAnnotations(newEntity));
  }
  if (!o.exposeEntities) {
    newEntity["@cds.api.ignore"] = true;
    newEntity["@requires"] = "InvalidRoleSoEntitiesCannotBeAccessedViaAPI";
  }
}

module.exports = {
  exposeCompositionsWithRewrites
};
