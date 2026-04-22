const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cds = require("@sap/cds");
const TempUtil = require("./tempUtil.js");
const tempUtil = new TempUtil(__filename);
process.env.NO_COLOR = true; // Required to parse build tasks
const { _processTasks } = require("./util.js");
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

  test("Throw warning when outdated org attribute is given", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-stale");
    injectStaleRetentionEntries(appRoot);
    await _processTasks(appRoot, buildTasks);
    expect(log.output).toMatch(
      /Your current deployment configuration contains an outdated organizational attribute/
    );
    expect(log.output).toMatch(/build completed/);
  });

  test("No warning for correct model", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-correct");
    injectCorrectRetentionEntries(appRoot);
    await _processTasks(appRoot, buildTasks);
    expect(log.output).not.toMatch(
      /Your current deployment configuration contains an outdated organizational attribute/
    );
    expect(log.output).toMatch(/build completed/);
  });

  test("Build adds dataSubjectRoles and organizationAttributes to fresh mta.yaml", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-fresh");
    await _processTasks(appRoot, buildTasks);
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
    await _processTasks(appRoot, buildTasks);
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

  test("Build completes when RetentionService is disabled", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-no-retention");
    setRequires(appRoot, "sap.ilm.RetentionService", false);
    await _processTasks(appRoot, buildTasks);
    expect(log.output).toMatch(/build completed/);
  });

  test("Build completes when InformationService is disabled", async () => {
    const appRoot = await generateBuildProject(tempUtil, "app-no-info");
    setRequires(appRoot, "sap.dpp.InformationService", false);
    await _processTasks(appRoot, buildTasks);
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
});
