const cds = require("@sap/cds");
cds._dpi = {
  buildMessages: []
};
cds._dpi.log = function log(module, options) {
  return cds.log(module, options);
};
const enhanceModel = require("../../lib/csn-enhancements");

// Regression coverage for issue #41 "Crash A": `cds build --production` runs a separate,
// isolated compilation per build task. For the db/ task, only the application's own db model
// is compiled — the plugin's service files (which `using` the `sap.ilm.blocking` /
// `sap.ilm.destruction` aspects from db/dpi.cds) are NOT part of that CSN. enhanceModel still
// runs via the `cds.on("loaded")` hook, so exposeEntity.js dereferenced
// m.definitions["sap.ilm.blocking"].elements on an undefined definition and crashed with
// `TypeError: Cannot read properties of undefined (reading 'elements')`.
//
// A model containing a DataSubjectDetails base entity (no query/projection) but WITHOUT the
// sap.ilm.* aspects in its definitions reproduces that isolated-db-task shape.
const DB_TASK_MODEL = `
  namespace dbtask;

  entity Customers {
    key ID   : UUID;
        name : String;
  }

  annotate Customers with @(PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'DataSubjectDetails'
  }) {
    ID   @PersonalData.FieldSemantics: 'DataSubjectID';
    name @PersonalData.IsPotentiallyPersonal;
  };
`;

const CUSTOMERS = "dbtask.Customers";
const BLOCKING_FIELD = "dppBlockingDate";
const DESTRUCTION_FIELDS = ["ilmEarliestDestructionDate", "ilmLatestDestructionDate"];

async function buildDbTaskCsn() {
  const csn = await cds.compile(DB_TASK_MODEL, { flavor: "inferred" });
  // Sanity: this mimics the db-task build where the plugin's aspects are absent.
  expect(csn.definitions["sap.ilm.blocking"]).toBeUndefined();
  expect(csn.definitions["sap.ilm.destruction"]).toBeUndefined();
  return csn;
}

describe("DB-task build: sap.ilm aspects absent from CSN (issue #41, Crash A)", () => {
  test("enhanceModel does not throw when sap.ilm.blocking/destruction are absent", async () => {
    const csn = await buildDbTaskCsn();
    expect(() => enhanceModel(csn)).not.toThrow();
  });

  test("base entity gains dppBlockingDate and destruction fields", async () => {
    const csn = await buildDbTaskCsn();
    enhanceModel(csn);
    const elements = csn.definitions[CUSTOMERS].elements;
    expect(elements[BLOCKING_FIELD]).toBeTruthy();
    for (const f of DESTRUCTION_FIELDS) {
      expect(elements[f]).toBeTruthy();
    }
  });

  test("enhanceModel is idempotent (second call does not throw or duplicate aspects)", async () => {
    const csn = await buildDbTaskCsn();
    enhanceModel(csn);
    const firstRun = { ...csn.definitions[CUSTOMERS].elements };
    expect(() => enhanceModel(csn)).not.toThrow();
    // Same element set after a second run — no duplication / corruption.
    expect(Object.keys(csn.definitions[CUSTOMERS].elements).sort()).toEqual(
      Object.keys(firstRun).sort()
    );
  });
});

describe("Runtime load: sap.ilm aspects present in CSN (no regression)", () => {
  // A normal runtime / all-tasks load includes the plugin's service, which carries the
  // sap.ilm.blocking / destruction aspects into the CSN. Pin that this path still injects
  // the aspect fields exactly once.
  const SCENARIO_FILES = [
    "./tests/csn-enhancements/scenarios/base.cds",
    "./srv/DPIInformation.cds",
    "./srv/DPIRetention.cds",
    "./srv/TableHeaderBlocking.cds"
  ];

  async function loadFullModel() {
    const model = await cds.load(SCENARIO_FILES);
    // Aspects are present in a full load because DPIRetention.cds `using`s them.
    expect(model.definitions["sap.ilm.blocking"]).toBeTruthy();
    expect(model.definitions["sap.ilm.destruction"]).toBeTruthy();
    return model;
  }

  function countBlockingFields(entity) {
    return Object.values(entity.elements).filter(
      (e) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    ).length;
  }

  test("aspect fields injected exactly once on a DataSubjectDetails base entity", async () => {
    const model = await loadFullModel();
    enhanceModel(model);
    // CustomerBillingData is a DataSubjectDetails base entity in base.cds.
    const entity = model.definitions["sap.ilm.bookshop.CustomerBillingData"];
    expect(entity.elements[BLOCKING_FIELD]).toBeTruthy();
    expect(countBlockingFields(entity)).toBe(1);
  });

  test("entity that already has a blocking field is not crashed or duplicated", async () => {
    const model = await loadFullModel();
    // ILMObjectWithStaticBlockingDisabled already carries a BlockingDate field (legacyBlockingDate)
    // in base.cds, exercising the `else if` branch in addBlockingAspectToBaseEntity.
    const before = model.definitions["sap.ilm.bookshop.ILMObjectWithStaticBlockingDisabled"];
    const beforeBlockingCount = countBlockingFields(before);
    expect(beforeBlockingCount).toBeGreaterThanOrEqual(1);
    expect(() => enhanceModel(model)).not.toThrow();
    const after = model.definitions["sap.ilm.bookshop.ILMObjectWithStaticBlockingDisabled"];
    // Still exactly one BlockingDate field — no duplicate injected.
    expect(countBlockingFields(after)).toBe(1);
  });
});

describe("Backstop: fallback aspect load fails (defensive guard, no raw TypeError)", () => {
  test("enhanceModel warns and returns gracefully when the aspect fallback cannot load", async () => {
    const csn = await buildDbTaskCsn();

    // Force the fallback path to fail by making the plugin's own db/dpi model unreadable.
    const fs = require("fs");
    const realReadFileSync = fs.readFileSync;
    // index.js and exposeEntity.js bind `LOG = cds._dpi.log("data-privacy")` at module-load
    // time, and that resolves to the shared `cds.log("data-privacy")` instance. Spy on that
    // instance's `warn` so we observe the already-bound logger.
    const warns = [];
    const logger = cds.log("data-privacy");
    const warnSpy = jest.spyOn(logger, "warn").mockImplementation((...parts) => {
      warns.push(parts.map((p) => (typeof p === "object" ? JSON.stringify(p) : `${p}`)).join(" "));
    });
    const readSpy = jest.spyOn(fs, "readFileSync").mockImplementation((p, ...rest) => {
      if (typeof p === "string" && p.replace(/\\/g, "/").endsWith("db/dpi.cds")) {
        throw new Error("forced fallback failure");
      }
      return realReadFileSync(p, ...rest);
    });

    try {
      expect(() => enhanceModel(csn)).not.toThrow();
      // A clear warning was logged by the defensive guard.
      expect(warns.some((w) => /sap\.ilm\.blocking/.test(w))).toBe(true);
    } finally {
      readSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
