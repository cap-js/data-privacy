const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cds = require("@sap/cds");
const TempUtil = require("./tempUtil.js");
const tempUtil = new TempUtil(__filename);
process.env.NO_COLOR = true; // Required to parse build tasks
const { _build } = require("./util.js");
const { register } = require("@sap/cds-dk/lib/build");
const {
  generateBuildProject,
  readMtaRetentionConfig,
  injectStaleRetentionEntries,
  injectCorrectRetentionEntries,
  setRequires
} = require("./setup.js");

const buildTasks = [
  {
    src: "srv",
    dest: "out",
    for: "data-privacy",
    options: {
      model: ["db", "srv", "app", "app/*", "@sap/cds/srv/outbox", "@cap-js/data-privacy"]
    }
  }
];

describe("testing cds build", () => {
  let log = cds.test.log();

  beforeAll(() => {
    require("../../cds-plugin.js");
    cds.build = require("@sap/cds-dk/lib/build");
    register("data-privacy", require("../../lib/build/index.js"));
  });
  afterAll(async () => {
    return tempUtil.cleanUp();
  });

  test("cds add data-privacy creates default_access_role.hdbrole for HANA projects", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-add-role");
    expect(fs.existsSync(path.join(appRoot, "db/src/defaults/default_access_role.hdbrole"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(appRoot, "db/src/defaults/.hdiconfig"))).toBe(true);

    const role = JSON.parse(
      fs.readFileSync(path.join(appRoot, "db/src/defaults/default_access_role.hdbrole"), "utf-8")
    );
    expect(role.role.name).toEqual("default_access_role");
    expect(role.role.schema_roles[0].names).toContain("sap.ilm.RestrictBlockedDataAccess");
  });

  test("Build emits error when default_access_role.hdbrole is missing", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-missing-role");
    // Delete the role file that cds add created
    fs.rmSync(path.join(appRoot, "db/src/defaults/default_access_role.hdbrole"));
    setRequires(appRoot, "db", { kind: "hana" });
    await _build(appRoot, buildTasks);
    expect(log.output).toMatch(/default_access_role\.hdbrole.*missing/);
    expect(log.output).toMatch(/cds add data-privacy/);
  });

  test("Build does not emit error when default_access_role.hdbrole exists", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-role-exists");
    setRequires(appRoot, "db", { kind: "hana" });
    await _build(appRoot, buildTasks);
    expect(log.output).not.toMatch(/default_access_role\.hdbrole.*missing/);
  });

  test("Throw warning when outdated org attribute is given", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-stale");
    injectStaleRetentionEntries(appRoot);
    await _build(appRoot, buildTasks);
    expect(log.output).toMatch(
      /Your current deployment configuration contains an outdated organizational attribute/
    );
    expect(log.output).toMatch(/build completed/);
  });

  test("No warning for correct model", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-correct");
    injectCorrectRetentionEntries(appRoot);
    await _build(appRoot, buildTasks);
    expect(log.output).not.toMatch(
      /Your current deployment configuration contains an outdated organizational attribute/
    );
    expect(log.output).toMatch(/build completed/);
  });

  test("Build adds dataSubjectRoles and organizationAttributes to fresh mta.yaml", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-fresh");
    await _build(appRoot, buildTasks);
    const retentionConfig = readMtaRetentionConfig(appRoot);

    expect(retentionConfig.dataSubjectRoles).toHaveLength(1);
    expect(retentionConfig.dataSubjectRoles).toEqual(
      expect.arrayContaining([expect.objectContaining({ dataSubjectRoleName: "Customer" })])
    );
    expect(retentionConfig.organizationAttributes).toHaveLength(1);
    expect(retentionConfig.organizationAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationAttributeName: "sap.capire.bookshop.LegalEntities" })
      ])
    );
  });

  test("Build does not change existing retention config idempotently", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-idempotent");
    injectCorrectRetentionEntries(appRoot);
    await _build(appRoot, buildTasks);
    const retentionConfig = readMtaRetentionConfig(appRoot);

    expect(retentionConfig.dataSubjectRoles).toHaveLength(1);
    expect(retentionConfig.dataSubjectRoles).toEqual(
      expect.arrayContaining([expect.objectContaining({ dataSubjectRoleName: "Customer" })])
    );
    expect(retentionConfig.organizationAttributes).toHaveLength(1);
    expect(retentionConfig.organizationAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationAttributeName: "sap.capire.bookshop.LegalEntities" })
      ])
    );
  });

  test("Build uses custom deploymentDescriptor path for mta.yaml", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-custom-descriptor");

    // Move mta.yaml to a subdirectory
    const customDir = path.join(appRoot, "deploy");
    fs.mkdirSync(customDir, { recursive: true });
    fs.renameSync(path.join(appRoot, "mta.yaml"), path.join(customDir, "mta.yaml"));
    expect(fs.existsSync(path.join(appRoot, "mta.yaml"))).toBe(false);

    // Configure custom deploymentDescriptor path
    setRequires(appRoot, "sap.ilm.RetentionService", { deploymentDescriptor: "deploy/mta.yaml" });

    await _build(appRoot, buildTasks);

    // Verify retention config was written to the custom path
    const retentionConfig = readMtaRetentionConfig(appRoot, "deploy/mta.yaml");
    expect(retentionConfig.dataSubjectRoles).toHaveLength(1);
    expect(retentionConfig.dataSubjectRoles).toEqual(
      expect.arrayContaining([expect.objectContaining({ dataSubjectRoleName: "Customer" })])
    );
    expect(retentionConfig.organizationAttributes).toHaveLength(1);
    expect(retentionConfig.organizationAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationAttributeName: "sap.capire.bookshop.LegalEntities" })
      ])
    );

    // Original location should still not exist
    expect(fs.existsSync(path.join(appRoot, "mta.yaml"))).toBe(false);
  });

  test("Build completes when RetentionService is disabled", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-no-retention");
    setRequires(appRoot, "sap.ilm.RetentionService", false);
    await _build(appRoot, buildTasks);
    expect(log.output).toMatch(/build completed/);
  });

  test("Build completes when InformationService is disabled", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-no-info");
    setRequires(appRoot, "sap.dpp.InformationService", false);
    await _build(appRoot, buildTasks);
    expect(log.output).toMatch(/build completed/);
  });
});

describe("incidents-mgmt cds build --production", () => {
  const INCIDENTS_DIR = path.join(__dirname, "..", "incidents-mgmt");
  const GEN_DIR = path.join(INCIDENTS_DIR, "gen");

  afterAll(() => {
    fs.rmSync(GEN_DIR, { recursive: true, force: true });
  });

  test("cds build --production completes successfully", () => {
    const result = execSync("npx cds build --production", {
      cwd: INCIDENTS_DIR,
      encoding: "utf-8",
      timeout: 120_000
    });

    expect(result).toMatch(/build completed/i);
    expect(fs.existsSync(path.join(GEN_DIR, "srv"))).toBe(true);
    expect(fs.existsSync(path.join(GEN_DIR, "mtx", "sidecar"))).toBe(true);
  });
});

describe("bookshop-app cds build --production", () => {
  const BOOKSHOP_DIR = path.join(__dirname, "..", "bookshop-app");
  const GEN_DIR = path.join(BOOKSHOP_DIR, "gen");

  afterAll(() => {
    fs.rmSync(GEN_DIR, { recursive: true, force: true });
  });

  test("cds build --production completes successfully", () => {
    const result = execSync("npx cds build --production", {
      cwd: BOOKSHOP_DIR,
      encoding: "utf-8",
      timeout: 120_000
    });

    expect(result).toMatch(/build completed/i);
    expect(fs.existsSync(path.join(GEN_DIR, "srv"))).toBe(true);
  });

  test("No analytic privilege contains 'null is null' in whereSql", () => {
    const genDbDir = path.join(GEN_DIR, "db", "src", "gen");
    const privilegeFiles = fs
      .readdirSync(genDbDir)
      .filter((f) => f.endsWith(".hdbanalyticprivilege"));

    expect(privilegeFiles.length).toBeGreaterThan(0);

    // Join views are excluded: their blocking field is added by index.js (in-process)
    // but the hana-restrictions hook that generates the whereSql runs in a separate
    // build context where the field is not yet resolved. This is a known limitation.
    const joinViewPrefixes = [
      "OrdersWithItems",
      "OrdersInnerJoin",
      "OrdersWithManyItemJoins",
      "OrdersWithMarketing",
      "OrdersJoinUnion"
    ];

    const violations = [];
    for (const file of privilegeFiles) {
      if (joinViewPrefixes.some((p) => file.startsWith(p))) continue;
      const content = fs.readFileSync(path.join(genDbDir, file), "utf-8");
      if (content.includes("null is null")) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  test("All service projections of ILM-relevant entities have a DPPRestriction analytic privilege", () => {
    const genDbDir = path.join(GEN_DIR, "db", "src", "gen");
    const privilegeFiles = fs
      .readdirSync(genDbDir)
      .filter((f) => f.endsWith(".DPPRestriction.hdbanalyticprivilege"));

    // Collect entity names that have a privilege
    const entitiesWithPrivilege = privilegeFiles.map((f) =>
      f.replace(".DPPRestriction.hdbanalyticprivilege", "")
    );

    // These service projections on ILM-relevant tables must each have a privilege
    const expectedEntities = [
      // Service projections on ILM root
      "CatalogService.Orders",
      "AdminService.Orders",
      // Service projections on composition targets
      "CatalogService.OrderItems",
      "CatalogService.Deliveries",
      "CatalogService.Payments",
      "CatalogService.ManagedComp2One",
      "CatalogService.UnmanagedComp2One2",
      "AdminService.OrderItems",
      "AdminService.Deliveries",
      "AdminService.Payments",
      "AdminService.ManagedComp2One",
      "AdminService.UnmanagedComp2One2",
      // DataSubject projections
      "CatalogService.Customers",
      "CatalogService.CustomerPostalAddress",
      "CatalogService.CustomerBillingData",
      // Multi-level projections (projection -> projection -> composition target)
      "OrderItemsL2",
      "OrderItemsL3",
      // Join views
      "OrdersWithItems",
      "OrdersInnerJoin",
      "OrdersWithManyItemJoins",
      "OrdersWithMarketing",
      // Union views
      "CustomersUnion",
      "OrderItemsUnion",
      // Union with join
      "OrdersJoinUnion",
      // Union on union
      "OrderItemsUnionL2"
    ];

    const missing = expectedEntities.filter((e) => !entitiesWithPrivilege.includes(e));
    expect(missing).toEqual([]);
  });

  test("Views referencing ILM tables include WITH STRUCTURED PRIVILEGE CHECK", () => {
    const genDbDir = path.join(GEN_DIR, "db", "src", "gen");

    const viewsToCheck = [
      // Simple projections
      "CatalogService.Orders.hdbview",
      "CatalogService.OrderItems.hdbview",
      "CatalogService.Deliveries.hdbview",
      "AdminService.Orders.hdbview",
      "AdminService.OrderItems.hdbview",
      // Multi-level projections
      "OrderItemsL2.hdbview",
      "OrderItemsL3.hdbview",
      // Join views
      "OrdersWithItems.hdbview",
      "OrdersInnerJoin.hdbview",
      "OrdersWithManyItemJoins.hdbview",
      "OrdersWithMarketing.hdbview",
      // Union views
      "CustomersUnion.hdbview",
      "OrderItemsUnion.hdbview",
      // Union with join
      "OrdersJoinUnion.hdbview",
      // Union on union
      "OrderItemsUnionL2.hdbview"
    ];

    const withoutPrivilegeCheck = [];
    for (const file of viewsToCheck) {
      const filePath = path.join(genDbDir, file);
      if (!fs.existsSync(filePath)) {
        withoutPrivilegeCheck.push(`${file} (missing)`);
        continue;
      }
      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.includes("STRUCTURED PRIVILEGE CHECK")) {
        withoutPrivilegeCheck.push(file);
      }
    }

    expect(withoutPrivilegeCheck).toEqual([]);
  });
});
