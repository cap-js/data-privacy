process.env.CDS_ENV = "with-mtx";

const cds = require("@sap/cds");
const {
  INCIDENTS_DIR,
  ALICE,
  ensureSidecarPlugin,
  cleanDbFiles,
  startSidecar,
  subscribeTenant,
  stopSidecar
} = require("./setup");

jest.setTimeout(60_000);

let sidecar;

beforeAll(async () => {
  ensureSidecarPlugin();
  cleanDbFiles();
  sidecar = await startSidecar();
  const status = await subscribeTenant("t1", sidecar.port);
  expect(status).toBe(200);
});

afterAll(async () => {
  await stopSidecar(sidecar?.proc);
});

const { GET } = cds.test(INCIDENTS_DIR);

describe("Information service (MTX)", () => {
  test("service document is served for tenant", async () => {
    const { status, data } = await GET("/dpp/information/", { auth: ALICE });
    expect(status).toBe(200);
    expect(data.value.length).toBeGreaterThan(0);
  });

  test("metadata is served for tenant", async () => {
    const { status } = await GET("/dpp/information/$metadata", { auth: ALICE });
    expect(status).toBe(200);
  });
});

describe("Retention service (MTX)", () => {
  test("iLMObjects discovery returns objects for tenant", async () => {
    const { status, data } = await GET("/dpp/retention/iLMObjects", { auth: ALICE });
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
  });

  test("ILM object Incidents is enabled for tenant", async () => {
    const { status, data } = await GET("/dpp/retention/iLMObjects/Incidents/isILMObjectEnabled", {
      auth: ALICE
    });
    expect(status).toBe(200);
    expect(data.isILMObjectEnabled).toBe(true);
  });

  test("i18n properties served for tenant", async () => {
    const { status } = await GET("/dpp/retention/i18n-files/i18n.properties", {
      auth: ALICE
    });
    expect(status).toBe(200);
  });
});
