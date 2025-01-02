const cds = require('@sap/cds');

let { GET } = cds.test().in(__dirname)
const DPI_Service = { username: 'dpi', password: '1234' }

describe('iLMObject discovery', () => {
    test('discovery endpoint is served', async () => {
        const {status, data} = await GET('/drm/iLMObjects', { auth: DPI_Service });
        expect(status).toEqual(200);
        expect(data.length).toBeGreaterThan(0);
    });

    test('test org attribute endpoints', async () => {
        const { getDPIentities } = require('../../lib/model/get-dpi-entities');
        const DRMSRV = await cds.connect.to('DRMService')
        const {organizationAttributes} = getDPIentities(cds.model, DRMSRV);
        for (const attribute of organizationAttributes) {
            const {status, data} = await GET(attribute.organizationAttributeValueHelpEndPoint, { auth: DPI_Service })
            expect(status).toEqual(200);
            expect(data.length).toBeGreaterThan(0)
            expect(data[0]).toMatchObject({
                organizationAttributeValue: expect.any(String),
                organizationAttributeValueDescription: expect.any(String)
            })
        }
    });
});