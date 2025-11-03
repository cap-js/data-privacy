const cds = require('@sap/cds');
const path = require('path');

let { POST: _POST } = cds.test().in(path.join(__dirname, '../bookshop-app'))
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
//TODO: Test that entities of DPIRetention service are not exposed via API

describe('DRM endpoints cannot be accessed with an unauthorized user', () => {
    const DPI_Service = { username: 'abc', password: '1234' }
    test('endOfResidence', async () => {
        const {status} = await POST('/drm/endOfResidence', {
            iLMObjectName: 'DPIRetentionService.Orders',
            selectionCriteria: [], 
            retentionStartDate: '2020-06-06', 
            referenceDateName: 'endOfWarrantyDate', 
            conditionSet: []
          }, { auth: DPI_Service });
        expect(status).toEqual(403);
    });
});