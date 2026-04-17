const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cds = require("@sap/cds");
const TempUtil = require("./tempUtil.js");
const tempUtil = new TempUtil(__filename);

const ROOT_NODE_MODULES = path.join(__dirname, "..", "..", "node_modules");
const DIR_MTA_BASIC = path.join(__dirname, "scenarios", "mta-basic");
const DIR_MTA_HANA = path.join(__dirname, "scenarios", "mta-hana");
const DIR_NO_MTA = path.join(__dirname, "scenarios", "no-mta");

function linkNodeModules(appRoot) {
  const target = path.join(appRoot, "node_modules");
  if (!fs.existsSync(target)) {
    fs.symlinkSync(ROOT_NODE_MODULES, target, "dir");
  }
}

function runCdsAdd(cwd) {
  linkNodeModules(cwd);
  return execSync("cds add data-privacy", {
    cwd,
    encoding: "utf-8",
    timeout: 120_000
  });
}

function readMta(appRoot) {
  const content = fs.readFileSync(path.join(appRoot, "mta.yaml"), "utf-8");
  return cds.parse.yaml(content);
}

function readXsSecurity(appRoot) {
  const content = fs.readFileSync(path.join(appRoot, "xs-security.json"), "utf-8");
  return JSON.parse(content);
}

function readUndeploy(appRoot) {
  const content = fs.readFileSync(path.join(appRoot, "db", "undeploy.json"), "utf-8");
  return JSON.parse(content);
}

function findDpiResource(mta, configType) {
  return mta.resources.find(
    (r) =>
      r.parameters?.service === "data-privacy-integration-service" &&
      r.parameters?.config?.dataPrivacyConfiguration?.configType === configType
  );
}

function findXsuaaResource(mta) {
  return mta.resources.find((r) => r.parameters?.service === "xsuaa");
}

function findSrvModule(mta) {
  return mta.modules.find((m) => m.type === "nodejs");
}

describe("cds add data-privacy", () => {
  afterAll(async () => {
    return tempUtil.cleanUp();
  });

  describe("with mta.yaml and xsuaa", () => {
    let appRoot;
    let mta;
    let xsSecurity;

    beforeAll(async () => {
      appRoot = await tempUtil.mkTempProject(DIR_MTA_BASIC);
      runCdsAdd(appRoot);
      mta = readMta(appRoot);
      xsSecurity = readXsSecurity(appRoot);
    });

    test("adds DPI information resource to mta.yaml", () => {
      const infoResource = findDpiResource(mta, "information");
      expect(infoResource).toBeDefined();
      expect(infoResource.parameters.service).toBe("data-privacy-integration-service");
      expect(infoResource.parameters["service-plan"]).toBe("data-privacy-internal");
      expect(
        infoResource.parameters.config.dataPrivacyConfiguration.informationConfiguration
      ).toBeDefined();
    });

    test("adds DPI retention resource to mta.yaml", () => {
      const retentionResource = findDpiResource(mta, "retention");
      expect(retentionResource).toBeDefined();
      expect(retentionResource.parameters.service).toBe("data-privacy-integration-service");
      expect(retentionResource.parameters["service-plan"]).toBe("data-privacy-internal");
      expect(
        retentionResource.parameters.config.dataPrivacyConfiguration.retentionConfiguration
      ).toBeDefined();
      expect(
        retentionResource.parameters.config.dataPrivacyConfiguration.translationConfiguration
      ).toBeDefined();
    });

    test("srv module requires DPI information and retention resources", () => {
      const srv = findSrvModule(mta);
      expect(srv).toBeDefined();
      const requireNames = srv.requires.map((r) => r.name);

      const infoResource = findDpiResource(mta, "information");
      const retentionResource = findDpiResource(mta, "retention");
      expect(requireNames).toContain(infoResource.name);
      expect(requireNames).toContain(retentionResource.name);
    });

    test("xsuaa resource has PersonalDataManagerUser scope in mta.yaml", () => {
      const xsuaa = findXsuaaResource(mta);
      expect(xsuaa).toBeDefined();
      const scopes = xsuaa.parameters.config.scopes;
      const pdmScope = scopes.find((s) => s.name === "$XSAPPNAME.PersonalDataManagerUser");
      expect(pdmScope).toBeDefined();
      expect(pdmScope["grant-as-authority-to-apps"]).toBeDefined();
      expect(pdmScope["grant-as-authority-to-apps"].length).toBeGreaterThan(0);
    });

    test("xsuaa resource has DataRetentionManagerUser scope in mta.yaml", () => {
      const xsuaa = findXsuaaResource(mta);
      expect(xsuaa).toBeDefined();
      const scopes = xsuaa.parameters.config.scopes;
      const drmScope = scopes.find((s) => s.name === "$XSAPPNAME.DataRetentionManagerUser");
      expect(drmScope).toBeDefined();
      expect(drmScope["grant-as-authority-to-apps"]).toBeDefined();
      expect(drmScope["grant-as-authority-to-apps"].length).toBeGreaterThan(0);
    });

    test("xs-security.json has PersonalDataManagerUser scope", () => {
      const pdmScope = xsSecurity.scopes.find(
        (s) => s.name === "$XSAPPNAME.PersonalDataManagerUser"
      );
      expect(pdmScope).toBeDefined();
      expect(pdmScope.description).toBeDefined();
      expect(pdmScope["grant-as-authority-to-apps"]).toBeDefined();
      expect(pdmScope["grant-as-authority-to-apps"].length).toBeGreaterThan(0);
    });

    test("xs-security.json has DataRetentionManagerUser scope", () => {
      const drmScope = xsSecurity.scopes.find(
        (s) => s.name === "$XSAPPNAME.DataRetentionManagerUser"
      );
      expect(drmScope).toBeDefined();
      expect(drmScope.description).toBeDefined();
      expect(drmScope["grant-as-authority-to-apps"]).toBeDefined();
      expect(drmScope["grant-as-authority-to-apps"].length).toBeGreaterThan(0);
    });

    test("xs-security.json scope grants reference correct DPI instance names", () => {
      const infoResource = findDpiResource(mta, "information");
      const retentionResource = findDpiResource(mta, "retention");

      const pdmScope = xsSecurity.scopes.find(
        (s) => s.name === "$XSAPPNAME.PersonalDataManagerUser"
      );
      const drmScope = xsSecurity.scopes.find(
        (s) => s.name === "$XSAPPNAME.DataRetentionManagerUser"
      );

      expect(pdmScope["grant-as-authority-to-apps"]).toEqual(
        expect.arrayContaining([`$XSSERVICENAME(${infoResource.name})`])
      );
      expect(drmScope["grant-as-authority-to-apps"]).toEqual(
        expect.arrayContaining([`$XSSERVICENAME(${retentionResource.name})`])
      );
    });
  });

  describe("with HANA configured", () => {
    let appRoot;

    beforeAll(async () => {
      appRoot = await tempUtil.mkTempProject(DIR_MTA_HANA);
      runCdsAdd(appRoot);
    });

    test("merges hdbanalyticprivilege entries into db/undeploy.json", () => {
      const undeploy = readUndeploy(appRoot);
      expect(undeploy).toContain("src/gen/**/*.hdbanalyticprivilege");
      expect(undeploy).toContain("src/**/*.hdbanalyticprivilege");
    });

    test("preserves existing undeploy.json entries", () => {
      const undeploy = readUndeploy(appRoot);
      expect(undeploy).toContain("src/gen/**/*.hdbview");
    });

    test("adds DPI resources to mta.yaml", () => {
      const mta = readMta(appRoot);
      expect(findDpiResource(mta, "information")).toBeDefined();
      expect(findDpiResource(mta, "retention")).toBeDefined();
    });

    test("adds scopes to xs-security.json", () => {
      const xsSecurity = readXsSecurity(appRoot);
      const scopeNames = xsSecurity.scopes.map((s) => s.name);
      expect(scopeNames).toContain("$XSAPPNAME.PersonalDataManagerUser");
      expect(scopeNames).toContain("$XSAPPNAME.DataRetentionManagerUser");
    });
  });

  describe("idempotency", () => {
    test("running cds add data-privacy twice produces same result", async () => {
      const appRoot = await tempUtil.mkTempProject(DIR_MTA_BASIC);

      // First run
      runCdsAdd(appRoot);
      const mtaAfterFirst = fs.readFileSync(path.join(appRoot, "mta.yaml"), "utf-8");
      const xsAfterFirst = fs.readFileSync(path.join(appRoot, "xs-security.json"), "utf-8");

      // Second run
      runCdsAdd(appRoot);
      const mtaAfterSecond = fs.readFileSync(path.join(appRoot, "mta.yaml"), "utf-8");
      const xsAfterSecond = fs.readFileSync(path.join(appRoot, "xs-security.json"), "utf-8");

      expect(mtaAfterSecond).toBe(mtaAfterFirst);
      expect(xsAfterSecond).toBe(xsAfterFirst);
    });
  });

  describe("without mta.yaml", () => {
    let appRoot;

    beforeAll(async () => {
      appRoot = await tempUtil.mkTempProject(DIR_NO_MTA);
      runCdsAdd(appRoot);
    });

    test("does not create mta.yaml", () => {
      expect(fs.existsSync(path.join(appRoot, "mta.yaml"))).toBe(false);
    });

    test("does not create xs-security.json", () => {
      expect(fs.existsSync(path.join(appRoot, "xs-security.json"))).toBe(false);
    });
  });
});
