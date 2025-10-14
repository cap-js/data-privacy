const cds = require('@sap/cds')

let { POST } = cds.test().in(__dirname)
require('../utils/fast-tests');
cds.test.data.autoReset(true);

describe('archiving', () => {
  const DPI_Service = { username: 'dpi', password: '1234' }

  test('endOfResidence without conditions nor selection criteria', async () => {
    const {BlockingStore} = cds.entities('sap.capire.blocking');
    const {Orders} = cds.entities('sap.capire.bookshop');
    const blockingBefore = await SELECT.from(BlockingStore);
    const ordersBefore = await SELECT.from(Orders);
    const {status, data} = await POST('/drm/endOfResidence', {
      iLMObjectName: 'DRMService.Orders',
      selectionCriteria: [], 
      retentionStartDate: '2020-06-06', 
      referenceDateName: 'endOfWarrantyDate', 
      conditionSet: []
    }, { auth: DPI_Service });
    expect(status).toEqual(200);
    expect(data).toMatchSnapshot();
    //Check that nothing is deleted
    const blockingAfter = await SELECT.from(BlockingStore);
    expect(blockingBefore.length).toEqual(blockingAfter.length);
    const ordersAfter = await SELECT.from(Orders);
    expect(ordersBefore.length).toEqual(ordersAfter.length);
  });

  test('simple archive', async () => {
    const {BlockingStore} = cds.entities('sap.capire.blocking');
    const blockingBefore = await SELECT.from(BlockingStore);
    const {Orders} = cds.entities('sap.capire.bookshop');
    const ordersBefore = await SELECT.from(Orders);
    const {status, data} = await POST('/drm/archive', {
      iLMObjectName: 'DRMService.Orders',
      referenceDateName: 'endOfWarrantyDate',
      iLMObjectArchiveResidenceRules: [{
        residenceRuleId: 'c355122e-5090-4e31-acf9-fe489d114581',
        iLMObjectInstances: [{
            retentionStartDate: '2020-04-04 00:00:00.000000000',
            retentionEndDate: '2020-04-04 00:00:00.000000000',
            keys: [{
                key: 'ID',
                value: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'
            }]
        }]
      }],
    }, { auth: DPI_Service });
    expect(status).toEqual(200);
    expect(data).toMatchObject({
      failure: 0,
      success: 1,
    });
    const blockingAfter = await SELECT.from(BlockingStore);
    expect(blockingBefore.length + 1).toEqual(blockingAfter.length);
    const ordersAfter = await SELECT.from(Orders);
    expect(ordersBefore.length - 1).toEqual(ordersAfter.length);
  });
});