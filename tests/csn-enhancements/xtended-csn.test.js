const cds = require("@sap/cds");
const path = require("path");

cds.test().in(path.join(__dirname, "../bookshop-app"));

describe("xtended csn", () => {
  let log = cds.test.log();
  test("Loading model with flavour xtended work", async () => {
    const model = await cds.load(
      [
        "../csn-enhancements/scenarios/base.cds",
        "@cap-js/data-privacy/srv/DPIInformation",
        "@cap-js/data-privacy/srv/TableHeaderBlocking"
      ],
      { flavor: "xtended" }
    );
    expect(model.meta["sap.ilm.enhanced"]).toEqual(true);
    expect(model.definitions["sap.ilm.RetentionService"]).toBeTruthy();
    expect(model.definitions["sap.dpp.InformationService"]).toBeTruthy();
    expect(log.output).not.toContain("Error");
  });
});
