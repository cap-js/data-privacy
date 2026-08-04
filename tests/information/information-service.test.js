const cds = require("@sap/cds");
const path = require("path");

let {
  GET,
  POST: _POST,
  PATCH: _PATCH,
  DELETE: _DELETE
} = cds.test().in(path.join(__dirname, "../bookshop-app"));
const DPI_Service = { username: "dpi", password: "1234" };

async function safeRequest(method, ...args) {
  try {
    return await method(...args);
  } catch (e) {
    return e.response ?? e;
  }
}
const POST = (...args) => safeRequest(_POST, ...args);
const PATCH = (...args) => safeRequest(_PATCH, ...args);
const DELETE = (...args) => safeRequest(_DELETE, ...args);

function buildKeyString(keys, record) {
  const keyParts = keys.map(
    (k) => `${k}=${typeof record[k] === "string" ? `'${record[k]}'` : record[k]}`
  );
  return keyParts.length === 1 ? keyParts[0] : keyParts.join(",");
}

describe("Information service", () => {
  let entities;
  let metadata;

  beforeAll(async () => {
    const { status, data } = await GET("/dpp/information/$metadata?$format=json", {
      auth: DPI_Service
    });
    expect(status).toEqual(200);
    metadata = data["sap.dpp.InformationService"];
    entities = Object.keys(metadata.EntityContainer).filter((k) => k !== "$Kind");
  });

  test("Data subject does not inherit keys from flattened elements", async () => {
    const Customer = cds.model.definitions["sap.dpp.InformationService.Customers"];
    const keys = Object.keys(Customer.elements).filter((e) => Customer.elements[e].key);
    expect(keys.length).toEqual(1);
    expect(keys[0]).toEqual("ID");
  });

  test("Auto-generated UI.LineItem does not contain the data subject ID field", () => {
    const { _getDataSubjectIDField } = require("../../lib/utils");

    for (const entity of entities) {
      const def = cds.model.definitions[`sap.dpp.InformationService.${entity}`];
      if (!def) continue;

      const lineItem = def["@UI.LineItem"];
      if (!lineItem) continue;

      const dsIdField = _getDataSubjectIDField(def.elements);
      if (!dsIdField) continue;

      // On DataSubject entities the DS ID is the primary key itself (e.g. ID on Customers)
      // and is intentionally kept in the LineItem as a key field.
      if (def.elements[dsIdField]?.key) continue;

      const lineItemValues = lineItem.map((item) => item.Value?.["="]);
      expect(lineItemValues).not.toContain(dsIdField);
    }
  });

  test("All entities in metadata can be requested via sap.dpp.InformationService", async () => {
    for (const entity of entities) {
      const { status: statusEntity, data: dataEntity } = await GET(`/dpp/information/${entity}`, {
        auth: DPI_Service
      });
      expect(statusEntity).toEqual(200);
      expect(dataEntity.value.length).toBeGreaterThan(0);
    }
  });

  describe("All exposed entities are readonly", () => {
    test("POST requests are rejected with 405 for all entities", async () => {
      for (const entity of entities) {
        const { status } = await POST(`/dpp/information/${entity}`, {}, { auth: DPI_Service });
        expect(status).toEqual(405);
      }
    });

    test("PATCH requests are rejected with 405 for all entities", async () => {
      for (const entity of entities) {
        const keys = metadata[entity]["$Key"];
        const { data: entityData } = await GET(`/dpp/information/${entity}?$top=1`, {
          auth: DPI_Service
        });
        const record = entityData.value[0];
        const keyStr = buildKeyString(keys, record);

        const { status } = await PATCH(
          `/dpp/information/${entity}(${keyStr})`,
          {},
          { auth: DPI_Service }
        );
        expect(status).toEqual(405);
      }
    });

    test("DELETE requests are rejected with 405 for all entities", async () => {
      for (const entity of entities) {
        const keys = metadata[entity]["$Key"];
        const { data: entityData } = await GET(`/dpp/information/${entity}?$top=1`, {
          auth: DPI_Service
        });
        const record = entityData.value[0];
        const keyStr = buildKeyString(keys, record);

        const { status } = await DELETE(`/dpp/information/${entity}(${keyStr})`, {
          auth: DPI_Service
        });
        expect(status).toEqual(405);
      }
    });
  });
});
