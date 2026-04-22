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

describe("Inline composition via projection — up_ targets base entity, only projection has DPI annotations", () => {
  // UserNewsletters is a projection on Newsletters.
  // Newsletters.Attachments has up_ targeting Newsletters (not UserNewsletters).
  // Only UserNewsletters has @PersonalData.EntitySemantics — Newsletters does not.
  // The plugin must resolve the up_ backlink through the projection hierarchy.

  let model;
  beforeAll(async () => {
    model = await cds.load([
      "../csn-enhancements/scenarios/inlineCompProjection.cds",
      "@cap-js/data-privacy/srv/DPIInformation",
      "@cap-js/data-privacy/srv/TableHeaderBlocking"
    ]);
  });

  test("Model is enhanced without errors", () => {
    expect(model.meta["sap.ilm.enhanced"]).toEqual(true);
  });

  test("UserNewsletters is exposed in RetentionService", () => {
    const entity = model.definitions["sap.ilm.RetentionService.UserNewsletters"];
    expect(entity).toBeTruthy();
    expect(entity.kind).toEqual("entity");
  });

  test("UserNewsletters is exposed in InformationService", () => {
    const entity = model.definitions["sap.dpp.InformationService.UserNewsletters"];
    expect(entity).toBeTruthy();
    expect(entity.kind).toEqual("entity");
  });

  test("Attachments composition is exposed in InformationService", () => {
    const attachments = model.definitions["sap.dpp.InformationService.Attachments"];
    expect(attachments).toBeTruthy();
    expect(attachments.kind).toEqual("entity");
  });

  test("Attachments composition is exposed in RetentionService", () => {
    const attachments = model.definitions["sap.ilm.RetentionService.Attachments"];
    expect(attachments).toBeTruthy();
    expect(attachments.kind).toEqual("entity");
  });

  test("up_ backlink is preserved on Attachments in InformationService (resolved through projection hierarchy)", () => {
    const attachments = model.definitions["sap.dpp.InformationService.Attachments"];
    expect(attachments).toBeTruthy();
    const backlinkElement = Object.entries(attachments.elements).find(
      ([, e]) =>
        e.type === "cds.Association" &&
        e.target === "sap.dpp.InformationService.UserNewsletters"
    );
    expect(backlinkElement).toBeTruthy();
  });

  test("up_ backlink is preserved on Attachments in RetentionService (resolved through projection hierarchy)", () => {
    const attachments = model.definitions["sap.ilm.RetentionService.Attachments"];
    expect(attachments).toBeTruthy();
    const backlinkElement = Object.entries(attachments.elements).find(
      ([, e]) =>
        e.type === "cds.Association" &&
        e.target === "sap.ilm.RetentionService.UserNewsletters"
    );
    expect(backlinkElement).toBeTruthy();
  });

  test("Personal data annotation on Attachments field is preserved", () => {
    const attachments = model.definitions["sap.dpp.InformationService.Attachments"];
    expect(attachments).toBeTruthy();
    expect(attachments.elements.fileName["@PersonalData.IsPotentiallyPersonal"]).toBeTruthy();
  });
});
