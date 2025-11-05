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
    test('dataSubjectEndOfBusiness', async () => {
        const {status} = await POST('/drm/dataSubjectEndOfBusiness', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'
        }, { auth: DPI_Service });
        expect(status).toEqual(403);
    });
});