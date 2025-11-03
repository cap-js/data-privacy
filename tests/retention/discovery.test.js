const cds = require('@sap/cds');
const path = require('path');

let { GET } = cds.test().in(path.join(__dirname, '../bookshop-app'))
const DPI_Service = { username: 'dpi', password: '1234' }

describe('iLMObject discovery', () => {
    test('discovery endpoint is served', async () => {
        const {status, data} = await GET('/drm/iLMObjects', { auth: DPI_Service });
        expect(status).toEqual(200);
        expect(data.length).toBeGreaterThan(0);
    });

    test('Selection criteria are correctly determined', async () => {
        const {status, data} = await GET('/drm/iLMObjects', { auth: DPI_Service });
        expect(status).toEqual(200);
        for (const iLMObject of data) {
            for (const selectionCriteria of iLMObject.destructionConfiguration.selectionCriteria.concat(iLMObject.archivingConfiguration?.selectionCriteria ?? [])) {
                if (selectionCriteria.selectionCriteriaValueHelpEndPoint) {
                    const {status, data} = await GET(selectionCriteria.selectionCriteriaValueHelpEndPoint, { auth: DPI_Service })
                    expect(status).toEqual(200);
                    expect(data.length).toBeGreaterThan(0)
                    expect(data[0]).toMatchObject({
                        value: expect.any(String),
                        valueDescription: expect.any(String)
                    })
                }
            }
        }
    });

    test('Conditions are correctly determined', async () => {
        const {status, data} = await GET('/drm/iLMObjects', { auth: DPI_Service });
        expect(status).toEqual(200);
        for (const iLMObject of data) {
            for (const condition of iLMObject.conditions) {
                expect(cds.model.definitions[`DPIRetentionService.${iLMObject.iLMObjectName}`].elements[condition.conditionFieldName]['@PersonalData.FieldSemantics']).toBeFalsy();
                const {status, data} = await GET(condition.conditionFieldValueHelpEndPoint, { auth: DPI_Service })
                expect(status).toEqual(200);
                expect(data.length).toBeGreaterThan(0)
                expect(data[0]).toMatchObject({
                    conditionFieldValue: expect.any(String),
                    conditionFieldValueDescription: expect.any(String)
                })
            }
        }
    });

    test('test org attribute endpoints', async () => {
        const organizationAttributes = Object.keys(cds.model.definitions).filter(n => n.startsWith('DPIRetentionService.valueHelp_orgAttribute'))
        for (const attribute of organizationAttributes) {
            const attributeDefinition = cds.model.definitions[attribute]
            const {status, data} = await GET(attributeDefinition['@ILM.ValueHelp.Path'], { auth: DPI_Service })
            expect(status).toEqual(200);
            expect(data.length).toBeGreaterThan(0)
            expect(data[0]).toMatchObject({
                organizationAttributeValue: expect.any(String),
                organizationAttributeValueDescription: expect.any(String)
            })
        }
    });
});