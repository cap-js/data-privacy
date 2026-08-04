const cds = require("@sap/cds");
const { build } = require("@sap/cds-dk/lib/build");

async function _build(project, tasks, options) {
  options ??= {};
  cds.root = project;
  cds.env = cds.env.for("cds", project);
  cds.requires = cds.env.requires;
  return build({ root: project, tasks, ...options });
}

module.exports = {
  _build
};
