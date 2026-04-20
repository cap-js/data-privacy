const fs = require("fs")
const path = require("path")

const mode = process.argv[2]
if (!mode || !["apply", "revert"].includes(mode)) {
  console.error("Usage: node deploy-patches.js <apply|revert>")
  process.exit(1)
}

const appDir = __dirname
const rootPkg = path.resolve(appDir, "../../package.json")

const WORKSPACES = [
  "tests/bookshop-app",
  "tests/incidents-mgmt",
  "tests/incidents-mgmt/mtx/sidecar",
  "tests/information/extend-information-endpoint",
  "tests/retention/extend-retention-endpoint"
]

if (mode === "apply") {
  const pkg = JSON.parse(fs.readFileSync(rootPkg, "utf8"))
  delete pkg.workspaces
  fs.writeFileSync(rootPkg, JSON.stringify(pkg, null, 2) + "\n")

  console.log("Deploy patches applied")
}

if (mode === "revert") {
  const pkg = JSON.parse(fs.readFileSync(rootPkg, "utf8"))
  pkg.workspaces = WORKSPACES
  fs.writeFileSync(rootPkg, JSON.stringify(pkg, null, 2) + "\n")

  // Revert bookshop-app dependency back to file reference
  const appPkg = path.resolve(appDir, "package.json")
  const appPkgContent = JSON.parse(fs.readFileSync(appPkg, "utf8"))
  appPkgContent.dependencies["@cap-js/data-privacy"] = "file:../../"
  fs.writeFileSync(appPkg, JSON.stringify(appPkgContent, null, 2) + "\n")

  console.log("Deploy patches reverted")
}
