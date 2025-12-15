const cds = require('@sap/cds');
const path = require('path');

let { GET, POST } = cds.test().in(path.join(__dirname, './extend-information-endpoint'));
const DPI_Service = { username: 'dpi', password: '1234' };

describe('Extending sap.ilm.InformationService to customize the endpoint', () => {
  test('sap.ilm.InformationService can be extended to add own entity exposures', async () => {
    const { Orders } = cds.entities('sap.ilm.InformationService');
    expect(Orders.elements.ID).toBeTruthy();
    expect(Orders.elements.legalEntity_title).toBeTruthy();
    expect(Orders.elements.legalEntity).toBeFalsy(); //Exclude Associations even if explicitly exposed and instead just add foreign keys
    expect(Orders.elements.aliasEndOfBusiness).toBeTruthy();
    expect(Orders.elements.Customer_ID).toBeTruthy();
    expect(Orders.elements.Items).toBeTruthy();
  });
});
