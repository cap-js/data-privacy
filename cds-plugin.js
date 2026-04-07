const cds = require("@sap/cds");
const xsenv = require("@sap/xsenv");
cds._dpi = {
  buildMessages: []
};
cds._dpi.log = function log(module, options) {
  if (cds.cli.command === "build") {
    const { BuildMessage } = require("@sap/cds-dk/lib/build/util");
    return {
      error: (...parts) =>
        cds._dpi.buildMessages.push(
          new BuildMessage(
            parts.map((p) => (typeof p === "object" ? JSON.stringify(p) : `${p}`)).join(" "),
            "Error"
          )
        ),
      info: (...parts) =>
        cds._dpi.buildMessages.push(
          new BuildMessage(
            parts.map((p) => (typeof p === "object" ? JSON.stringify(p) : `${p}`)).join(" "),
            "Info"
          )
        ),
      warn: (...parts) =>
        cds._dpi.buildMessages.push(
          new BuildMessage(
            parts.map((p) => (typeof p === "object" ? JSON.stringify(p) : `${p}`)).join(" "),
            "Warning"
          )
        ),
      debug: (...parts) =>
        cds._dpi.buildMessages.push(
          new BuildMessage(
            parts.map((p) => (typeof p === "object" ? JSON.stringify(p) : `${p}`)).join(" "),
            "Debug"
          )
        )
    };
  } else {
    return cds.log(module, options);
  }
};

const enhanceModel = require("./lib/csn-enhancements");
const path = require("path");
const fs = require("fs/promises");
const { enhanceModelForDBRestrictions } = require("./lib/build/hana-restrictions");
require("./lib/csn-runtime-extensions");

cds.on("loaded", (csn) => {
  enhanceModel(csn);
  if (cds.env.requires.db?.kind === "hana") {
    enhanceModelForDBRestrictions(csn);
  }
});

cds.on("listening", async () => {
  if (!cds.env.requires["sap.ilm.RetentionService"].applicationName) {
    const { name } = JSON.parse(await fs.readFile(path.join(cds.root, "package.json")));
    cds.env.requires["sap.ilm.RetentionService"].applicationName = name;
  }
});

/**
 * After READ handler mutating the response by adding the xsappname's of bound DPI service instances
 * @param {*} dependencies
 */
function addDPIDependencies(dependencies) {
  const services = xsenv.filterServices({ label: "data-privacy-integration-service" });
  const dpiDependencies = services.map((service) => ({
    xsappname: service.credentials?.uaa?.xsappname
  }));
  for (const dependency of dpiDependencies) {
    if (dependency.xsappname && !dependencies.some((d) => d.xsappname === dependency.xsappname)) {
      dependencies.push(dependency);
    }
  }
}

cds.on("served", async (all) => {
  if (all["cds.xt.SaasProvisioningService"]) {
    const saasProvisioning = await cds.connect.to("cds.xt.SaasProvisioningService");
    saasProvisioning.after("dependencies", addDPIDependencies);
    cds.debug("data-privacy")(
      `Added handler to cds.xt.SaasProvisioningService for adding DPI dependencies.`
    );
  } else if (all["cds.xt.SmsProvisioningService"]) {
    const smsProvisioning = await cds.connect.to("cds.xt.SmsProvisioningService");
    smsProvisioning.after("READ", "dependencies", addDPIDependencies);
    cds.debug("data-privacy")(
      `Added handler to cds.xt.SmsProvisioningService for adding DPI dependencies.`
    );
  } else {
    cds.debug("data-privacy")(
      `Skipping handler registration for adding DPI dependencies to subscription dependencies callback.`
    );
  }
});

cds.build?.register?.("data-privacy", require("./lib/build"));

// REVISIT: Remove once command is in DK
cds.add?.register?.("data-privacy", require("./_move_to_dk/add.js"));
