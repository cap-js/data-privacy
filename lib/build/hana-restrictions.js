const cds = require("@sap/cds");
const LOG = cds.log("data-privacy");
const { LinkedDefinitions } = require("@sap/cds/lib/core/linked-csn");
const { _getRoot } = require("../utils");

const _hdi_migration = cds.compiler.to.hdi.migration;
cds.compiler.to.hdi.migration = function (csn, options, beforeImage) {
  const res = _hdi_migration(csn, options, beforeImage);

  const iLMObjects = csn.definitions["sap.ilm.RetentionService"]._dpi.iLMObjects;
  const dataSubjects = csn.definitions["sap.ilm.RetentionService"]._dpi.dataSubjects;

  const iLMRelevantTables = new LinkedDefinitions();
  const collectEntities = (name, parent, compositionName) => {
    const root = _getRoot(csn.definitions[name]);
    iLMRelevantTables[root.name] = {
      path: parent
        ? iLMRelevantTables[_getRoot(csn.definitions[parent]).name].path.concat(compositionName)
        : [name],
      definition: root
    };
    if (csn.definitions[name].compositions) {
      for (const comp of csn.definitions[name].compositions) {
        collectEntities(comp.target, name, comp.name);
      }
    }
  };
  for (const defName in iLMObjects) {
    collectEntities(iLMObjects[defName].name);
  }
  for (const defName in dataSubjects) {
    collectEntities(dataSubjects[defName].name);
  }

  const privileges = [];
  const allDataPrivileges = [];

  const effectiveCSN = cds.reflect(structuredClone(csn));

  // Find all views depending on the iLMObject tables and append @sql.append: 'WITH STRUCTURED PRIVILEGE CHECK'
  for (const name in csn.definitions) {
    const entity = csn.definitions[name];
    if (entity.kind !== "entity") continue;
    const tableEntity = _getRoot(entity);
    // DPI service interfaces are skipped because these users need to have access
    if (
      tableEntity.name !== entity.name &&
      iLMRelevantTables[tableEntity.name] &&
      !entity.name.startsWith("sap.dpp.InformationService") &&
      !entity.name.startsWith("sap.ilm.RetentionService")
    ) {
      const entityName = entity.name.replaceAll(".", "_").toUpperCase();

      let whereConditionBlocked = `(${effectiveCSN.definitions[name]._dpi.blockingDateReference} is null or ${effectiveCSN.definitions[name]._dpi.blockingDateReference} &gt; CURRENT_UTCTIMESTAMP)`;
      if (
        effectiveCSN.definitions[name]["@Auditing.AuditorScopes"] ||
        effectiveCSN.definitions[name]._service?.["@Auditing.DefaultAuditorScopes"]
      ) {
        const auditorScopes =
          csn.definitions[name]["@Auditing.AuditorScopes"] ||
          effectiveCSN.definitions[name]._service?.["@Auditing.DefaultAuditorScopes"];
        for (const scope of auditorScopes) {
          whereConditionBlocked += ` or SESSION_CONTEXT('ROLES') like '%${scope},%'`;
        }
      } else {
        whereConditionBlocked += ` or SESSION_CONTEXT('ROLES') like '%Auditor,%'`;
      }
      allDataPrivileges.push(entityName);

      res.definitions.push({
        name: `${entity.name}.DPPRestriction`,
        suffix: ".hdbanalyticprivilege",
        sql: `<?xml version="1.0" encoding="UTF-8"?>
                    <Privilege:analyticPrivilege xmlns:Privilege="http://www.sap.com/ndb/BiModelPrivilege.ecore" id="${entityName}_DPPRestriction" privilegeType="SQL_ANALYTIC_PRIVILEGE" schemaVersion="1.1">
                        <descriptions defaultDescription="${entityName}_DPPRestriction"/>
                        <securedModels>
                        <modelUri>${entityName}</modelUri>
                        </securedModels>
                        <whereSql>${whereConditionBlocked}</whereSql>
                    </Privilege:analyticPrivilege>`
      });
      privileges.push(`${entityName}_DPPRestriction`);
    }
  }
  res.definitions.push({
    name: `sap.ilm.NoDPPRestriction`,
    suffix: ".hdbanalyticprivilege",
    sql: `<?xml version="1.0" encoding="UTF-8"?>
            <Privilege:analyticPrivilege xmlns:Privilege="http://www.sap.com/ndb/BiModelPrivilege.ecore" id="sap.ilm.NoDPPRestriction" privilegeType="SQL_ANALYTIC_PRIVILEGE" schemaVersion="1.1">
                <descriptions defaultDescription="Access without DPP restrictions"/>
                <securedModels>
                ${allDataPrivileges.map((entityName) => `<modelUri>${entityName}</modelUri>`)}
                </securedModels>
                <whereSql>true = true</whereSql>
            </Privilege:analyticPrivilege>`
  });
  // Role collecting all blocked data privileges

  const blockedDataAccessRole = {
    role: {
      name: "sap.ilm.RestrictBlockedDataAccess",
      pattern_escape_character: "/",
      schema_analytic_privileges: [
        {
          privileges: privileges
        }
      ],
      object_privileges: [
        {
          name: "%",
          type: "TABLE",
          privileges: ["SELECT"],
          pattern_mode: "include"
        },
        {
          name: "%",
          type: "VIEW",
          privileges: ["SELECT"],
          pattern_mode: "include"
        }
      ]
    }
  };

  if (cds.env.requires["sap.ilm.RetentionService"]?.tableRestrictions === "db") {
    for (const table in iLMRelevantTables) {
      blockedDataAccessRole.role.object_privileges.push({
        name: table.toUpperCase().replaceAll(".", `/_`),
        type: "TABLE",
        privileges: ["SELECT"],
        pattern_mode: "exclude"
      });
    }
  }

  res.definitions.push({
    name: `sap.ilm.RestrictBlockedDataAccess`,
    sql: JSON.stringify(blockedDataAccessRole),
    suffix: ".hdbrole"
  });

  res.definitions.push({
    name: `sap.ilm.DPPNoRestrictions`,
    sql: JSON.stringify({
      role: {
        name: "sap.ilm.NoRestrictions",
        schema_analytic_privileges: [
          {
            privileges: ["sap.ilm.NoDPPRestriction"]
          }
        ]
      }
    }),
    suffix: ".hdbrole"
  });
  return res;
};

function enhanceModelForDBRestrictions(csn) {
  LOG.debug(`Collect all ILM relevant tables and views to append a structured privilege check`);
  const effectiveModel = cds.reflect(csn);
  const iLMObjects = effectiveModel.definitions["sap.ilm.RetentionService"]._dpi.iLMObjects;
  const dataSubjects = effectiveModel.definitions["sap.ilm.RetentionService"]._dpi.dataSubjects;

  const iLMRelevantTables = new LinkedDefinitions();
  const collectEntities = (name) => {
    const root = _getRoot(effectiveModel.definitions[name]);
    iLMRelevantTables[root.name] = root;
    if (effectiveModel.definitions[name].compositions) {
      for (const comp of effectiveModel.definitions[name].compositions) {
        collectEntities(comp.target);
      }
    }
  };
  for (const defName in iLMObjects) {
    collectEntities(iLMObjects[defName].name);
  }
  for (const defName in dataSubjects) {
    collectEntities(dataSubjects[defName].name);
  }

  // Find all views depending on the iLMObject tables and append @sql.append: 'WITH STRUCTURED PRIVILEGE CHECK'
  for (const entity of csn.collect(
    (d) => d.kind === "entity",
    (d) => d
  )) {
    const tableEntity = _getRoot(entity);
    if (
      tableEntity.name !== entity.name &&
      iLMRelevantTables[tableEntity.name] &&
      !entity.name.startsWith("sap.dpp.InformationService") &&
      !entity.name.startsWith("sap.ilm.RetentionService")
    ) {
      entity["@sql.append"] = "WITH STRUCTURED PRIVILEGE CHECK";
    }
  }
}

function retrieveLowestQuery(query) {
  if (query.SELECT?.from?.SELECT) {
    return retrieveLowestQuery(query.SELECT.from);
  }
  return query.SELECT ?? query.UPDATE ?? query.DELETE ?? query.INSERT;
}

cds.on("served", async () => {
  const db = await cds.connect.to("db");
  db.before("*", (req) => {
    req._tx.set({
      ROLES: `${Object.keys(cds.context.user.roles).join(",") + ","}`
    });
  });
  db.after("*", (res, req) => {
    req._tx.set({ ROLES: "" });
  });

  if (
    cds.env.requires["sap.ilm.RetentionService"]?.tableRestrictions === "srv" ||
    cds.env.requires.db.kind !== "hana"
  ) {
    db.before("*", (req) => {
      if (!req.target) return; //BEGIN, …
      const auditorScopes = req.target["@Auditing.AuditorScopes"] ||
        req.target._service?.["@Auditing.DefaultAuditorScopes"] || ["Auditor"];
      if (auditorScopes.some((scope) => req.user.is(scope)) || req.user._is_privileged) return;

      // Make sure it is a select on a base entity, e.g. table because views have analytic privileges
      if (
        (!req.target.query && !req.target.projection) ||
        (cds.env.requires.db.kind !== "hana" &&
          req.target._service?.name !== "sap.dpp.InformationService" &&
          req.target._service?.name !== "sap.ilm.RetentionService")
      ) {
        if (req.target._dpi.blockingDateReference) {
          const query = retrieveLowestQuery(req.query);
          const where = [
            { ref: [req.target._dpi.blockingDateReference] },
            "is",
            { val: null },
            "or",
            { ref: [req.target._dpi.blockingDateReference] },
            ">",
            { ref: ["$now"] }
          ];
          query.where = query.where ? [{ xpr: query.where }, "and", { xpr: where }] : where;
        }
      }
    });
  }
  if (
    cds.env.requires["sap.ilm.RetentionService"]?.tableRestrictions === "db" &&
    cds.env.requires.db.kind !== "hana"
  ) {
    db.before("*", (req) => {
      if (!req.target) return; //BEGIN, …
      const auditorScopes = req.target["@Auditing.AuditorScopes"] ??
        req.target._service?.["@Auditing.DefaultAuditorScopes"] ?? ["Auditor"];
      if (auditorScopes.some((scope) => req.user.is(scope)) || req.user._is_privileged) return;

      // Make sure it is a select on a base entity, e.g. table because views have analytic privileges
      if (req.event === "READ" && !req.target.query && !req.target.projection) {
        if (req.target._dpi.iLMObject || req.target._dpi.dataSubject) {
          return req.reject(
            401,
            `Entity ${req.target.name} is either an ILMObject or a DataSubject and as such its table cannot be directly accessed!`
          );
        }
      }
    });
  }
});

module.exports = {
  enhanceModelForDBRestrictions
};
