const cds = require("@sap/cds");
const path = require("path");

let { GET: _GET } = cds.test().in(path.join(__dirname, "../bookshop-app"));
const GET = async function () {
  try {
    return await _GET(...arguments);
  } catch (e) {
    return e.response ?? e;
  }
};
const DPI_Service = { username: "dpi", password: "1234" };

describe("Inline composition (up_ backlink) on ILM entity", () => {
  test("Inline composition entity is exposed in RetentionService", () => {
    const campaigns = cds.model.definitions["sap.ilm.RetentionService.Campaigns"];
    expect(campaigns).toBeTruthy();
    expect(campaigns.kind).toEqual("entity");
  });

  test("Inline composition entity is exposed in InformationService", () => {
    const campaigns = cds.model.definitions["sap.dpp.InformationService.Campaigns"];
    expect(campaigns).toBeTruthy();
    expect(campaigns.kind).toEqual("entity");
  });

  test("Exposed composition in InformationService has backlink to parent", () => {
    const campaigns = cds.model.definitions["sap.dpp.InformationService.Campaigns"];
    expect(campaigns).toBeTruthy();
    // Should have a backlink association pointing to Marketing in the service
    const backlink = Object.entries(campaigns.elements).find(
      ([, e]) =>
        e.type === "cds.Association" &&
        e.target === "sap.dpp.InformationService.Marketing"
    );
    expect(backlink).toBeTruthy();
  });

  test("Exposed composition in RetentionService has backlink to parent", () => {
    const campaigns = cds.model.definitions["sap.ilm.RetentionService.Campaigns"];
    expect(campaigns).toBeTruthy();
    const backlink = Object.entries(campaigns.elements).find(
      ([, e]) =>
        e.type === "cds.Association" &&
        e.target === "sap.ilm.RetentionService.Marketing"
    );
    expect(backlink).toBeTruthy();
  });

  test("Inline composition has blocking aspect in RetentionService", () => {
    const campaigns = cds.model.definitions["sap.ilm.RetentionService.Campaigns"];
    expect(campaigns).toBeTruthy();
    const blockingField = Object.entries(campaigns.elements).find(
      ([, e]) => e["@PersonalData.FieldSemantics"] === "BlockingDate"
    );
    expect(blockingField).toBeTruthy();
  });

  test("InformationService Campaigns can be read via OData", async () => {
    const { status, data } = await GET("/dpp/information/Campaigns", {
      auth: DPI_Service
    });
    expect(status).toEqual(200);
    expect(data.value).toBeDefined();
    expect(data.value.length).toBeGreaterThan(0);
  });

  test("InformationService Marketing can be read with expanded Campaigns", async () => {
    const { status, data } = await GET("/dpp/information/Marketing", {
      auth: DPI_Service
    });
    expect(status).toEqual(200);
    expect(data.value).toBeDefined();
    expect(data.value.length).toBeGreaterThan(0);
  });

  test("Personal data annotation on inline composition field is preserved", () => {
    const campaigns = cds.model.definitions["sap.dpp.InformationService.Campaigns"];
    expect(campaigns).toBeTruthy();
    expect(campaigns.elements.name["@PersonalData.IsPotentiallyPersonal"]).toBeTruthy();
  });
});
