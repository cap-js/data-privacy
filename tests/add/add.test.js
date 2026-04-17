const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cds = require("@sap/cds");
const TempUtil = require("./tempUtil.js");
const tempUtil = new TempUtil(__filename);

const ROOT_DIR = path.join(__dirname, "..", "..");
const ROOT_NODE_MODULES = path.join(ROOT_DIR, "node_modules");

/**
 * Generates a CAP project via `cds init` with given facets,
 * injects @cap-js/data-privacy dependency, and symlinks node_modules.
 * @param {string} name - project folder name
 * @param {string[]} facets - facets to add (e.g. ["mta", "xsuaa", "hana"])
 * @returns {Promise<string>} path to the generated project
 */
async function generateProject(name, facets = []) {
  const tempDir = await tempUtil.mkTempFolder();
  const addFlag = facets.length > 0 ? ` --add ${facets.join(",")}` : "";
  execSync(`npx cds init ${name} --nodejs${addFlag}`, {
    cwd: tempDir,
    encoding: "utf-8",
    timeout: 120_000
  });
  const projectDir = path.join(tempDir, name);

  // Inject @cap-js/data-privacy dependency so cds-plugin.js is discovered
  const pkgPath = path.join(projectDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.dependencies ??= {};
  pkg.dependencies["@cap-js/data-privacy"] = `file:${ROOT_DIR}`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // Symlink root node_modules for module resolution
  fs.symlinkSync(ROOT_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");

  return projectDir;
}

function runCdsAdd(cwd) {
  return execSync("npx cds add data-privacy", {
    cwd,
    encoding: "utf-8",
    timeout: 120_000
  });
}

function readMta(appRoot) {
  return cds.parse.yaml(fs.readFileSync(path.join(appRoot, "mta.yaml"), "utf-8"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
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
  return mta.modules.find((m) => m.type === "nodejs" && m.path?.includes("srv"));
}

function findSidecarModule(mta) {
  return mta.modules.find((m) => m.type === "nodejs" && m.path?.includes("mtx"));
}

describe("cds add data-privacy", () => {
  afterAll(async () => {
    return tempUtil.cleanUp();
  });

  describe("single-tenant (mta, xsuaa)", () => {
    let appRoot, mta, xsSecurity;

    beforeAll(async () => {
      appRoot = await generateProject("basic", ["mta", "xsuaa"]);
      runCdsAdd(appRoot);
      mta = readMta(appRoot);
      xsSecurity = readJson(path.join(appRoot, "xs-security.json"));
    });

    test("adds DPI information and retention resources to mta.yaml", () => {
      const info = findDpiResource(mta, "information");
      expect(info).toBeDefined();
      expect(info.parameters.service).toBe("data-privacy-integration-service");
      expect(info.parameters["service-plan"]).toBe("data-privacy-internal");
      expect(info.parameters.config.dataPrivacyConfiguration.informationConfiguration).toBeDefined();

      const retention = findDpiResource(mta, "retention");
      expect(retention).toBeDefined();
      expect(retention.parameters.service).toBe("data-privacy-integration-service");
      expect(retention.parameters.config.dataPrivacyConfiguration.retentionConfiguration).toBeDefined();
      expect(retention.parameters.config.dataPrivacyConfiguration.translationConfiguration).toBeDefined();
    });

    test("srv module requires DPI resources", () => {
      const srv = findSrvModule(mta);
      const names = srv.requires.map((r) => r.name);
      expect(names).toContain(findDpiResource(mta, "information").name);
      expect(names).toContain(findDpiResource(mta, "retention").name);
    });

    test("xsuaa resource has DPI scopes and processed-after", () => {
      const xsuaa = findXsuaaResource(mta);
      const scopes = xsuaa.parameters.config.scopes;
      const scopeNames = scopes.map((s) => s.name);
      expect(scopeNames).toContain("$XSAPPNAME.PersonalDataManagerUser");
      expect(scopeNames).toContain("$XSAPPNAME.DataRetentionManagerUser");

      const processedAfter = xsuaa["processed-after"];
      expect(processedAfter).toContain(findDpiResource(mta, "information").name);
      expect(processedAfter).toContain(findDpiResource(mta, "retention").name);
    });

    test("enableAutoSubscription is true for single-tenant", () => {
      const infoApp = findDpiResource(mta, "information")
        .parameters.config.dataPrivacyConfiguration.applicationConfiguration;
      const retApp = findDpiResource(mta, "retention")
        .parameters.config.dataPrivacyConfiguration.applicationConfiguration;
      expect(infoApp.enableAutoSubscription).toBe(true);
      expect(retApp.enableAutoSubscription).toBe(true);
    });

    test("xs-security.json has DPI scopes with correct grant references", () => {
      const infoName = findDpiResource(mta, "information").name;
      const retName = findDpiResource(mta, "retention").name;

      const pdm = xsSecurity.scopes.find((s) => s.name === "$XSAPPNAME.PersonalDataManagerUser");
      const drm = xsSecurity.scopes.find((s) => s.name === "$XSAPPNAME.DataRetentionManagerUser");
      expect(pdm).toBeDefined();
      expect(drm).toBeDefined();
      expect(pdm["grant-as-authority-to-apps"]).toEqual(
        expect.arrayContaining([`$XSSERVICENAME(${infoName})`])
      );
      expect(drm["grant-as-authority-to-apps"]).toEqual(
        expect.arrayContaining([`$XSSERVICENAME(${retName})`])
      );
    });
  });

  describe("multi-tenant (mta, xsuaa, hana, multitenancy)", () => {
    let appRoot, mta, xsSecurity, sidecarPkg;

    beforeAll(async () => {
      appRoot = await generateProject("mtx", ["mta", "xsuaa", "hana", "multitenancy"]);
      runCdsAdd(appRoot);
      mta = readMta(appRoot);
      xsSecurity = readJson(path.join(appRoot, "xs-security.json"));
      sidecarPkg = readJson(path.join(appRoot, "mtx", "sidecar", "package.json"));
    });

    test("enableAutoSubscription is not set for multi-tenant", () => {
      const infoApp = findDpiResource(mta, "information")
        .parameters.config.dataPrivacyConfiguration.applicationConfiguration;
      const retApp = findDpiResource(mta, "retention")
        .parameters.config.dataPrivacyConfiguration.applicationConfiguration;
      expect(infoApp.enableAutoSubscription).toBeUndefined();
      expect(retApp.enableAutoSubscription).toBeUndefined();
    });

    test("sidecar module requires DPI resources", () => {
      const sidecar = findSidecarModule(mta);
      expect(sidecar).toBeDefined();
      const names = sidecar.requires.map((r) => r.name);
      expect(names).toContain(findDpiResource(mta, "information").name);
      expect(names).toContain(findDpiResource(mta, "retention").name);
    });

    test("srv module requires DPI resources", () => {
      const srv = findSrvModule(mta);
      const names = srv.requires.map((r) => r.name);
      expect(names).toContain(findDpiResource(mta, "information").name);
      expect(names).toContain(findDpiResource(mta, "retention").name);
    });

    test("xsuaa resource has DPI scopes and processed-after", () => {
      const xsuaa = findXsuaaResource(mta);
      const scopeNames = xsuaa.parameters.config.scopes.map((s) => s.name);
      expect(scopeNames).toContain("$XSAPPNAME.PersonalDataManagerUser");
      expect(scopeNames).toContain("$XSAPPNAME.DataRetentionManagerUser");

      const processedAfter = xsuaa["processed-after"];
      expect(processedAfter).toContain(findDpiResource(mta, "information").name);
      expect(processedAfter).toContain(findDpiResource(mta, "retention").name);
    });

    test("xs-security.json has DPI scopes and preserves mtcallback", () => {
      const scopeNames = xsSecurity.scopes.map((s) => s.name);
      expect(scopeNames).toContain("$XSAPPNAME.PersonalDataManagerUser");
      expect(scopeNames).toContain("$XSAPPNAME.DataRetentionManagerUser");
      expect(scopeNames).toContain("$XSAPPNAME.mtcallback");
    });

    test("sidecar package.json has @cap-js/data-privacy and disables services", () => {
      expect(sidecarPkg.dependencies["@cap-js/data-privacy"]).toBeDefined();
      expect(sidecarPkg.cds.requires["sap.dpp.InformationService"]).toBe(false);
      expect(sidecarPkg.cds.requires["sap.ilm.RetentionService"]).toBe(false);
      expect(sidecarPkg.cds.profile).toBe("mtx-sidecar");
    });

    test("merges hdbanalyticprivilege into undeploy.json preserving existing entries", () => {
      const undeploy = readJson(path.join(appRoot, "db", "undeploy.json"));
      expect(undeploy).toContain("src/gen/**/*.hdbanalyticprivilege");
      expect(undeploy).toContain("src/**/*.hdbanalyticprivilege");
      expect(undeploy).toContain("src/gen/**/*.hdbview");
    });
  });

  describe("idempotency", () => {
    test("running cds add data-privacy twice produces same result", async () => {
      const appRoot = await generateProject("idempotent", ["mta", "xsuaa", "hana", "multitenancy"]);

      runCdsAdd(appRoot);
      const mtaFirst = fs.readFileSync(path.join(appRoot, "mta.yaml"), "utf-8");
      const xsFirst = fs.readFileSync(path.join(appRoot, "xs-security.json"), "utf-8");
      const sidecarFirst = fs.readFileSync(path.join(appRoot, "mtx", "sidecar", "package.json"), "utf-8");

      runCdsAdd(appRoot);
      const mtaSecond = fs.readFileSync(path.join(appRoot, "mta.yaml"), "utf-8");
      const xsSecond = fs.readFileSync(path.join(appRoot, "xs-security.json"), "utf-8");
      const sidecarSecond = fs.readFileSync(path.join(appRoot, "mtx", "sidecar", "package.json"), "utf-8");

      expect(mtaSecond).toBe(mtaFirst);
      expect(xsSecond).toBe(xsFirst);
      expect(sidecarSecond).toBe(sidecarFirst);
    });
  });

  describe("without mta.yaml", () => {
    let appRoot;

    beforeAll(async () => {
      appRoot = await generateProject("nomta", []);
      runCdsAdd(appRoot);
    });

    test("does not create mta.yaml or xs-security.json", () => {
      expect(fs.existsSync(path.join(appRoot, "mta.yaml"))).toBe(false);
      expect(fs.existsSync(path.join(appRoot, "xs-security.json"))).toBe(false);
    });
  });
});
