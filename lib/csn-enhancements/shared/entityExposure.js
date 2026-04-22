const { _getSourceEntity, _getQueryFrom, getCompEntityName } = require("../../utils");
const cds = require("@sap/cds");
const LOG = cds._dpi.log("data-privacy");

const _maxDepth = () => cds.env.requires["sap.ilm.RetentionService"]?.maxProjectionDepth ?? 20;

/**
 * Determine the lowest ranking entity in a projection hierarchy which is still annotated with @PersonalData.EntitySemantics
 * @param {*} entity
 * @param {CSN} model
 * @returns Entity Name
 */
function getLowestILMObjectInProjectionHierarchy(entity, model) {
  const def = model.definitions[entity];
  const sourceEntity = _getSourceEntity(_getQueryFrom(def));
  if (sourceEntity && model.definitions[sourceEntity]?.["@PersonalData.EntitySemantics"]) {
    return getLowestILMObjectInProjectionHierarchy(sourceEntity, model);
  }
  return entity;
}

/**
 * Redirect associations of an entity to its counterparts in a service if possible.
 * This is done to prohibit redundant exposures in the Retention Service, which would mess up exposed Org Attributes
 */
function redirectAssociationsToServiceIfPossible(def, serviceName, model) {
  PerElement: for (const ele in def.elements) {
    if (!def.elements[ele].target || def.elements[ele].target.startsWith(serviceName)) {
      continue;
    }
    // Rewrite association to point to entity exposed in service, in case something is exposed
    for (const e in model.definitions) {
      if (!e.startsWith(serviceName + ".") || e.startsWith(serviceName + ".valueHelp_")) continue;
      let currentEntity = model.definitions[e];
      let depth = 0;
      do {
        if (++depth > _maxDepth()) {
          LOG.error(
            `Exceeded maximum projection depth (${_maxDepth()}) while redirecting associations for ${ele}. Possible circular projection. Increase via cds.requires["sap.ilm.RetentionService"].maxProjectionDepth.`
          );
          break;
        }
        const sourceEntity = _getSourceEntity(_getQueryFrom(currentEntity));
        if (!sourceEntity) break;
        if (def.elements[ele].target === sourceEntity) {
          def.elements[ele].target = e;
          continue PerElement;
        }
        currentEntity = model.definitions[sourceEntity];
      } while (currentEntity);
    }
  }
}

/**
 * Find an exposed entity whose base entity matches the given target,
 * walking up the projection hierarchy of each exposed entity.
 */
function findExposedEntityForTarget(target, exposedEntities, model) {
  for (const exposedBase in exposedEntities) {
    let current = exposedBase;
    let depth = 0;
    while (current) {
      if (++depth > _maxDepth()) {
        LOG.error(
          `Exceeded maximum projection depth (${_maxDepth()}) while resolving target for ${target}. Possible circular projection. Increase via cds.requires["sap.ilm.RetentionService"].maxProjectionDepth.`
        );
        break;
      }
      if (current === target) return exposedEntities[exposedBase];
      const def = model.definitions[current];
      if (!def) break;
      current = _getSourceEntity(_getQueryFrom(def));
    }
  }
  return undefined;
}

/**
 * Remove associations from the entity definition, but keep foreign keys if the associations are not exposed in the service passed via serviceName.
 */
function fixRelationTarget(def, exposedEntities, serviceName, model) {
  for (const ele in def.elements) {
    if (def.elements[ele].target && def.elements[ele].target.startsWith(serviceName)) {
      continue;
    }
    if (def.elements[ele].target && typeof exposedEntities[def.elements[ele].target] === "string") {
      def.elements[ele].target = exposedEntities[def.elements[ele].target];
    } else if (def.elements[ele].target) {
      const resolvedTarget = findExposedEntityForTarget(
        def.elements[ele].target,
        exposedEntities,
        model
      );
      if (typeof resolvedTarget === "string") {
        def.elements[ele].target = resolvedTarget;
      } else {
        if (def.elements[ele].keys) {
          for (const key of def.elements[ele].keys) {
            const foreignKeyName = ele + "_" + key.ref.join("_");
            //REVISIT: key.ref.join('_') is not correct for accessing .elements
            def.elements[foreignKeyName] = structuredClone(
              model.definitions[def.elements[ele].target].elements[key.ref.join("_")]
            );
            // Ensures that foreign keys are not copied over as keys
            delete def.elements[foreignKeyName].key;
            Object.keys(def.elements[ele])
              .filter((prop) => prop.startsWith("@"))
              .forEach((anno) => {
                def.elements[foreignKeyName][anno] = def.elements[ele][anno];
              });
            const query = def.query?.SELECT ?? def.projection;
            query.columns ??= ["*"];
            query.columns.push({
              ref: [ele].concat(key.ref),
              as: foreignKeyName
            });
            if (query.columns.some((c) => c.ref && c.ref.length === 1 && c.ref[0] === ele)) {
              const idx = query.columns.findIndex(
                (c) => c.ref && c.ref.length === 1 && c.ref[0] === ele
              );
              query.columns.splice(idx, 1);
            }
          }
        }
        delete def.elements[ele];
        const query = def.query?.SELECT ?? def.projection;
        query.excluding ??= [];
        if (!query.excluding.some((e) => e === ele)) {
          query.excluding.push(ele);
        }
      }
    }
  }
}

/**
 * Expose composed entities which are part of the passed definition
 * @param {*} def
 * @param {*} srvPrefix
 * @param {*} exposedEntities Which entities are exposed as part of the DPI service
 * @param {*} m CSN Model
 * @param {*} options.exposeEntities Whether or not the compositions should be accessible via the endpoint
 */
function exposeCompositions(
  def,
  srvPrefix,
  exposedEntities,
  m,
  options = { exposeEntities: true, readonly: true }
) {
  // Defaults
  options = { exposeEntities: true, readonly: true, ...options };

  const compositions = Object.entries(def.elements).filter(([, e]) => e.type === "cds.Composition"); //REVISIT: Possible problem if one hides the composition behind a custom type
  if (compositions.length > 0) {
    for (const [, comp] of compositions) {
      let compEntityName = getCompEntityName(comp.target, undefined, m);
      const entityAlreadyExposed = !!m.definitions[srvPrefix + "." + compEntityName];
      const newCompEntity =
        m.definitions[srvPrefix + "." + compEntityName] ??
        structuredClone(m.definitions[comp.target]);
      if (!options.exposeEntities) {
        newCompEntity["@cds.api.ignore"] = true;
        newCompEntity["@requires"] = "InvalidRoleSoEntitiesCannotBeAccessedViaAPI";
      }
      if (!entityAlreadyExposed) {
        if (newCompEntity.includes) delete newCompEntity.includes;
        newCompEntity.projection = {
          from: { ref: [comp.target] }
        };
        m.definitions[srvPrefix + "." + compEntityName] = newCompEntity;
        if (options.readonly) {
          newCompEntity["@readonly"] = true;
        }
      }
      exposedEntities[comp.target] = srvPrefix + "." + compEntityName;
      comp.target = srvPrefix + "." + compEntityName;
      exposeCompositions(newCompEntity, srvPrefix, exposedEntities, m, options);
    }
  }
}

function exposeAutoExposedEntities(
  def,
  srvName,
  srvEntityMappings,
  m,
  options = { exposeEntities: true, readonly: true }
) {
  // Defaults
  options = { exposeEntities: true, readonly: true, ...options };

  for (const ele in def.elements) {
    const compEntityName = def.elements[ele].target
      ? getCompEntityName(def.elements[ele].target, undefined, m)
      : undefined;
    if (
      def.elements[ele].target &&
      !srvEntityMappings[def.elements[ele].target] &&
      m.definitions[def.elements[ele].target]["@cds.autoexpose"]
    ) {
      if (!m.definitions[srvName + "." + compEntityName]) {
        const newCompEntity = structuredClone(m.definitions[def.elements[ele].target]);
        if (newCompEntity.includes) delete newCompEntity.includes;
        newCompEntity.projection = {
          from: { ref: [def.elements[ele].target] }
        };
        m.definitions[srvName + "." + compEntityName] = newCompEntity;
        if (!options.exposeEntities) {
          newCompEntity["@cds.api.ignore"] = true;
          newCompEntity["@requires"] = "InvalidRoleSoEntitiesCannotBeAccessedViaAPI";
        }
        if (options.readonly) {
          newCompEntity["@readonly"] = true;
        }
        srvEntityMappings[def.elements[ele].target] = srvName + "." + compEntityName;
        def.elements[ele].target = srvName + "." + compEntityName;
      }
      exposeCompositions(
        m.definitions[srvName + "." + compEntityName],
        srvName,
        srvEntityMappings,
        m,
        options
      );
    }
  }
}

const gCompsToOne = (elements) =>
  Object.entries(elements).filter(
    ([, e]) => e.type === "cds.Composition" && e.cardinality && e.cardinality.max === 1
  ); //REVISIT: Is possible issue for compositions hidden behind a custom type

function searchInCompForField(def, fn, model) {
  const compsToOne = gCompsToOne(def.elements);
  for (const [n, c] of compsToOne) {
    const ce = model.definitions[c.target];
    if (fn(ce.elements)) {
      return {
        as: [n, fn(ce.elements)].join("."),
        def: ce.elements[fn(ce.elements)]
      };
    }
    const r = searchInCompForField(ce, fn, model);
    if (r) {
      return { as: [n, r.as].join("."), def: r.def };
    }
  }
  return null;
}

/**
 * Makes sure Data subject, Org Attribute and end of business date are fields on the root for direct access. Logic handlers require these fields to be directly on root.
 */
function defineILMRootColumns(newEntity, fields, model) {
  let additionalFields = ["*"];
  for (const field in fields) {
    if (typeof fields[field] === "function") {
      const actualField = searchInCompForField(newEntity, fields[field], model);
      if (actualField) {
        additionalFields.push({
          ref: actualField.as.split("."),
          as: actualField.as.split(".").join("_")
        });
        newEntity.elements[actualField.as.split(".").join("_")] = actualField.def;
        fields[field] = actualField.as;
      }
    }
  }
  return additionalFields;
}

module.exports = {
  getLowestILMObjectInProjectionHierarchy,
  redirectAssociationsToServiceIfPossible,
  fixRelationTarget,
  exposeAutoExposedEntities,
  defineILMRootColumns
};
