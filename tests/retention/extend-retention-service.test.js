const cds = require('@sap/cds');
const path = require('path');

let { GET, POST } = cds.test().in(path.join(__dirname, './extend-retention-endpoint'))
const DPI_Service = { username: 'dpi', password: '1234' }

describe('Extending sap.dpp.RetentionService to customize the endpoint', () => {
  test('discovery endpoint is still served', async () => {
    const { status, data } = await GET('/dpp/retention/iLMObjects', { auth: DPI_Service });
    expect(status).toEqual(200);
    expect(data.length).toBeGreaterThan(0);
  });

  test('discovery endpoint exposes aliased property names', async () => {
    const { status, data } = await GET('/dpp/retention/iLMObjects', { auth: DPI_Service });
    expect(status).toEqual(200);
    const ORDER = data.find(d => d.iLMObjectName === 'Orders');
    expect(ORDER.referenceDates[0].referenceDateName).toEqual('aliasEndOfBusiness')
  });

  test('sap.dpp.RetentionService can be extended to add own entity exposures', async () => {
    const {Orders} = cds.entities('sap.dpp.RetentionService')

    expect(Orders.elements.ID).toBeTruthy();
    expect(Orders.elements.legalEntity_title).toBeTruthy();
    expect(Orders.elements.legalEntity).toBeFalsy(); //Exclude Associations even if explicitly exposed and instead just add foreign keys
    expect(Orders.elements.aliasEndOfBusiness).toBeTruthy();
    expect(Orders.elements.Customer_ID).toBeTruthy();
    expect(Orders.elements.Items).toBeTruthy();

    //DPP flags are still exposed
    expect(Orders.elements.dppBlockingDate).toBeTruthy();
    expect(Orders.elements.dppEarliestDestructionDate).toBeTruthy();
  });

  test('DPI Retention handlers can be intercepted', async () => {
    const { status, data } = await POST('/dpp/retention/dataSubjectInformation', {
      applicationName: 'bookshop-retention',
      dataSubjectRoleName: 'Customer',
      dataSubjects: [
        { dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad' }
      ]
    }, { auth: DPI_Service });
    expect(status).toEqual(200);
    expect(data.length).toEqual(1)
    expect(data[0]).toMatchObject({ dataSubjectId: 'ABC', emailId: 'abc@def.com', name: 'Max Muster' })
  });
});