const cds = require('@sap/cds')

let { POST } = cds.test().in(__dirname);
cds.test.data.autoReset(true);
const DPI_Service = { username: 'dpi', password: '1234' }

describe('destruction', () => {
    beforeEach(async () => {
      await POST('/drm/archive', {
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
    });

    test('destruction without selection criteria', async () => {
      const {BlockingStore} = cds.entities('sap.capire.blocking');
      const blockingBefore = await SELECT.from(BlockingStore);
      const {status, data} = await POST('/drm/destruction', {
        applicationName: 'ABC_TEST', 
        iLMObjectName: 'DRMService.Orders',
        runId: '38843682-4f35-4087-8618-19e5a9450d36', 
        selectionCriteria : []
      }, { auth: DPI_Service });
      expect(status).toEqual(202);
      expect(data).toMatchObject({
        requestId: "38843682-4f35-4087-8618-19e5a9450d36", 
        requestStatusCode: 4, 
        requestStatusMessage: "Request completed."
      });
      const blockingAfter = await SELECT.from(BlockingStore);
      expect(blockingBefore.length).toBeGreaterThan(blockingAfter.length);
    });

  test('simulateDestruction without selection criteria', async () => {
    const {BlockingStore} = cds.entities('sap.capire.blocking');
    const blockingBefore = await SELECT.from(BlockingStore);
    const {status, data} = await POST('/drm/simulateDestruction', {
      applicationName: 'ABC_TEST', 
      iLMObjectName: 'DRMService.Orders',
      runId: '38843682-4f35-4087-8618-19e5a9450d36', 
      selectionCriteria : []
    }, { auth: DPI_Service });
    expect(status).toEqual(202);
    expect(data).toMatchObject({
      requestId: "38843682-4f35-4087-8618-19e5a9450d36", 
      requestStatusCode: 4, 
      requestStatusMessage: "Request succesfully simulated."
    });
    const blockingAfter = await SELECT.from(BlockingStore);
    expect(blockingBefore.length).toEqual(blockingAfter.length);
  });
});