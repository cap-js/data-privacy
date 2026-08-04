const cds = require("@sap/cds");
const path = require("path");

cds.test().in(path.join(__dirname, "./extend-information-endpoint"));

describe("Extending sap.dpp.InformationService to customize the endpoint", () => {
  test("sap.dpp.InformationService can be extended to add own entity exposures", async () => {
    const { Orders } = cds.entities("sap.dpp.InformationService");
    expect(Orders.elements.ID).toBeTruthy();
    expect(Orders.elements.legalEntity_title).toBeTruthy();
    expect(Orders.elements.legalEntity).toBeFalsy(); //Exclude Associations even if explicitly exposed and instead just add foreign keys
    expect(Orders.elements.aliasEndOfBusiness).toBeTruthy();
    expect(Orders.elements.Customer_ID).toBeTruthy();
    expect(Orders.elements.Items).toBeTruthy();
  });
});
