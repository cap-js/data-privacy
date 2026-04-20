const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cds = require("@sap/cds");

const ROOT_DIR = path.join(__dirname, "..", "..");
const ROOT_NODE_MODULES = path.join(ROOT_DIR, "node_modules");
const TEMPLATES_DIR = path.join(__dirname, "templates");

/**
 * Generate a CAP project via cds init, copy CDS model templates, inject plugin dep,
 * symlink node_modules, then run cds add data-privacy.
 */
async function generateBuildProject(tempUtil, name, facets = ["mta", "xsuaa", "hana"]) {
  const tempDir = await tempUtil.mkTempFolder();
  execSync(`npx cds init ${name} --nodejs --add ${facets.join(",")}`, {
    cwd: tempDir,
    encoding: "utf-8",
    timeout: 120_000
  });
  const projectDir = path.join(tempDir, name);

  // Copy CDS model templates
  fs.cpSync(path.join(TEMPLATES_DIR, "db"), path.join(projectDir, "db"), { recursive: true });
  fs.cpSync(path.join(TEMPLATES_DIR, "srv"), path.join(projectDir, "srv"), { recursive: true });

  // Inject @cap-js/data-privacy dep + symlink node_modules
  const pkgPath = path.join(projectDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.dependencies ??= {};
  pkg.dependencies["@cap-js/data-privacy"] = `file:${ROOT_DIR}`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  fs.symlinkSync(ROOT_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");

  // Run cds add data-privacy to generate DPI resources in mta.yaml + xs-security.json
  execSync("npx cds add data-privacy", {
    cwd: projectDir,
    encoding: "utf-8",
    timeout: 120_000
  });

  return projectDir;
}

function readMtaRetentionConfig(appRoot) {
  const mtaContent = fs.readFileSync(path.join(appRoot, "mta.yaml"), "utf-8");
  const mta = cds.parse.yaml(mtaContent);
  const retentionResource = mta.resources.find(
    (r) =>
      r.parameters?.service === "data-privacy-integration-service" &&
      r.parameters?.config?.dataPrivacyConfiguration?.configType === "retention"
  );
  return retentionResource?.parameters?.config?.dataPrivacyConfiguration?.retentionConfiguration;
}

/**
 * Inject stale dataSubjectRoles and organizationAttributes into the retention config.
 */
function injectStaleRetentionEntries(appRoot) {
  const mtaPath = path.join(appRoot, "mta.yaml");
  const mta = cds.parse.yaml(fs.readFileSync(mtaPath, "utf-8"));
  const retentionResource = mta.resources.find(
    (r) =>
      r.parameters?.service === "data-privacy-integration-service" &&
      r.parameters?.config?.dataPrivacyConfiguration?.configType === "retention"
  );
  const retConf =
    retentionResource.parameters.config.dataPrivacyConfiguration.retentionConfiguration;
  retConf.dataSubjectRoles = [
    { dataSubjectRoleName: "Employee", dataSubjectDescription: "Employee" },
    { dataSubjectRoleName: "Customer", dataSubjectDescription: "Customer" },
    { dataSubjectRoleName: "Student", dataSubjectDescription: "Student" }
  ];
  retConf.organizationAttributes = [
    {
      organizationAttributeName: "sap.capire.bookshop.LegalEntities",
      organizationAttributeDescription: "LegalEntity"
    },
    {
      organizationAttributeName: "test.dpp.university.Universities",
      organizationAttributeDescription: "stale"
    },
    { organizationAttributeName: "Universities", organizationAttributeDescription: "stale" },
    { organizationAttributeName: "universityStr", organizationAttributeDescription: "stale" }
  ];
  fs.writeFileSync(mtaPath, cds.compile.to.yaml(mta));
}

/**
 * Inject correct (current) dataSubjectRoles and organizationAttributes into the retention config.
 */
function injectCorrectRetentionEntries(appRoot) {
  const mtaPath = path.join(appRoot, "mta.yaml");
  const mta = cds.parse.yaml(fs.readFileSync(mtaPath, "utf-8"));
  const retentionResource = mta.resources.find(
    (r) =>
      r.parameters?.service === "data-privacy-integration-service" &&
      r.parameters?.config?.dataPrivacyConfiguration?.configType === "retention"
  );
  const retConf =
    retentionResource.parameters.config.dataPrivacyConfiguration.retentionConfiguration;
  retConf.dataSubjectRoles = [
    {
      dataSubjectRoleName: "Customer",
      dataSubjectDescription: "Customer",
      dataSubjectBaseURL: "~{srv-api/srv-url}",
      dataSubjectBlockingEndPoint: "/dpp/retention/dataSubjectBlocking",
      dataSubjectInformationEndPoint: "/dpp/retention/dataSubjectInformation",
      dataSubjectsDestroyingEndPoint: "/dpp/retention/dataSubjectsDestroying"
    }
  ];
  retConf.organizationAttributes = [
    {
      organizationAttributeName: "sap.capire.bookshop.LegalEntities",
      organizationAttributeDescription: "LegalEntity",
      organizationAttributeBaseURL: "~{srv-api/srv-url}",
      organizationAttributeValueHelpEndPoint:
        "/dpp/retention/valueHelp_orgAttribute_sap_capire_bookshop_LegalEntities"
    }
  ];
  fs.writeFileSync(mtaPath, cds.compile.to.yaml(mta));
}

/**
 * Set a cds.requires entry in the project's package.json.
 */
function setRequires(appRoot, key, value) {
  const pkgPath = path.join(appRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.cds ??= {};
  pkg.cds.requires ??= {};
  pkg.cds.requires[key] = value;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

module.exports = {
  generateBuildProject,
  readMtaRetentionConfig,
  injectStaleRetentionEntries,
  injectCorrectRetentionEntries,
  setRequires
};
