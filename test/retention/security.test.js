const cds = require('@sap/cds')

let { POST: _POST } = cds.test().in(__dirname)
const POST = async function() {
    try {
        return await _POST(...arguments)
    } catch (e) {
        return e.response ?? e;
    }
}
cds.test.data.autoReset(true);
//TODO: Test that all endpoints require authorisation
//TODO: Test that i18n endpoints require authorisation

describe('DRM endpoints cannot be accessed with an unauthorized user', () => {
    const DPI_Service = { username: 'abc', password: '1234' }
    test('endOfResidence', async () => {
        const {status} = await POST('/drm/endOfResidence', {
            iLMObjectName: 'DRMService.Orders',
            selectionCriteria: [], 
            retentionStartDate: '2020-06-06', 
            referenceDateName: 'endOfWarrantyDate', 
            conditionSet: []
          }, { auth: DPI_Service });
        expect(status).toEqual(403);
    });

    test('archive', async () => {
        const {status} = await POST('/drm/archive', {
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
        expect(status).toEqual(403);
    });
});