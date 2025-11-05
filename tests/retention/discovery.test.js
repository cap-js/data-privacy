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

    describe('iLMObject enabled', () => {
        test('ILM Object check endpoint is served', async () => {
            const {status, data} = await GET('/drm/iLMObjects', { auth: DPI_Service });
            expect(status).toEqual(200);
            for (const iLMObject of data) {
                const {status: statusCheck, data: resultCheck} = await GET(iLMObject.iLMObjectCheckEndPoint, { auth: DPI_Service })
                expect(statusCheck).toEqual(200);
                expect(resultCheck.isILMObjectEnabled).toEqual(expect.any(Boolean))
            }
        });
        test('ILMObject is enabled by default', async () => {
            const {status, data} = await GET('/drm/iLMObjects/Orders/isILMObjectEnabled', { auth: DPI_Service })
            expect(status).toEqual(200);
            expect(data.isILMObjectEnabled).toEqual(true)
        });

        test('ILMObject enablement considers boolean value for @ILM.BlockingEnabled annotation', async () => {
            const {status, data} = await GET('/drm/iLMObjects/ILMObjectWithStaticBlockingDisabled/isILMObjectEnabled', { auth: DPI_Service })
            expect(status).toEqual(200);
            expect(data.isILMObjectEnabled).toEqual(false)
        });

        test('ILMObject enablement considers edmJson path & pointing to different service for @ILM.BlockingEnabled annotation', async () => {
            const {status, data} = await GET('/drm/iLMObjects/ILMObjectWithEDMJSONBlockingEnabled/isILMObjectEnabled', { auth: DPI_Service })
            expect(status).toEqual(200);
            expect(data.isILMObjectEnabled).toEqual(false)
        });

        test('ILMObject enablement considers xpr path for @ILM.BlockingEnabled annotation', async () => {
            const {status, data} = await GET('/drm/iLMObjects/ILMObjectWithXPRBlockingEnabled/isILMObjectEnabled', { auth: DPI_Service })
            expect(status).toEqual(200);
            expect(data.isILMObjectEnabled).toEqual(true)
        });
    })

    // REVISIT: Only relevant once archiving/destruction is added
    test.skip('Selection criteria are correctly determined', async () => {
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