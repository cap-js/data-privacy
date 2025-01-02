const cds = require('@sap/cds')

let { GET } = cds.test().in(__dirname)
cds.test.data.autoReset(true);
const DPI_Service = { username: 'dpi', password: '1234' }

describe('iLMObject discovery', () => {
    test('discovery endpoint is served', async () => {
        const {status, data} = await GET('/drm/iLMObjects', { auth: DPI_Service });
        expect(status).toEqual(200);
        expect(data.length).toBeGreaterThan(0);
    });
});