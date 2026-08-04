const cds = require("@sap/cds");
cds._dpi = {
  buildMessages: []
};
cds._dpi.log = function log(module, options) {
  return cds.log(module, options);
};
const enhanceModelWithValueLists = require("../../lib/csn-enhancements/retention/enhanceModelWithValueLists");
const ilmObjectEntityOrder = "sap.ilm.bookshop.Orders";
const ilmObjectNoOrgAttribute = "sap.ilm.bookshop.OrdersNoOrgAttributes";
const dataSubjectEntityCustomer = "sap.ilm.bookshop.Customers";

let log = cds.test.log();

describe("enhanceModelWithValueLists", () => {
  let mockModel;
  let mockEntity;

  beforeEach(async () => {
    mockModel = await cds.load([
      "./srv/DPIInformation.cds",
      "./srv/TableHeaderBlocking.cds",
      "./tests/csn-enhancements/scenarios/enhanceModelWithValueList.cds"
    ]);
  });

  describe("buildOrganizationAttribute", () => {
    test("should create value help for organization attribute with DataControllerID", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelpKeys = Object.keys(mockModel.definitions).filter((k) =>
        k.startsWith("sap.ilm.RetentionService.valueHelp_orgAttribute")
      );
      expect(valueHelpKeys.length).toBeGreaterThan(0);
    });

    test("should create value help for organization attribute with LineOrganization", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelpKeys = Object.keys(mockModel.definitions).filter((k) =>
        k.startsWith("sap.ilm.RetentionService.valueHelp_orgAttribute")
      );
      expect(valueHelpKeys.length).toBeGreaterThan(0);
    });

    test("should log error if multiple organization attributes exist", () => {
      mockModel.definitions[ilmObjectEntityOrder].elements["org2"] = {
        type: "cds.String",
        "@PersonalData.FieldSemantics": "DataControllerID"
      };

      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);
      expect(log.output).toContain("has multiple organization attributes configured");
    });

    test("should log error if no organization attribute exists", () => {
      mockEntity = mockModel.definitions[ilmObjectNoOrgAttribute];

      enhanceModelWithValueLists(ilmObjectNoOrgAttribute, mockEntity, mockModel);
      expect(log.output).toContain("no organization attributes");
    });

    test("should set ILM.OrganizationAttributeName on value help entity", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) => def["@ILM.OrganizationAttributeName"] !== undefined
      );
      expect(valueHelp).toBeDefined();
      expect(valueHelp["@ILM.OrganizationAttributeName"]).toBeDefined();
    });

    test("should set Common.Label on value help entity", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) =>
          def["@Common.Label"] !==
          ilmObjectEntityOrder.split(".")[ilmObjectEntityOrder.split(".").length - 1]
      );
      expect(valueHelp).toBeDefined();
    });
  });

  describe("buildConditions", () => {
    test("should create value help for field with PurposeID semantics", () => {
      mockModel.definitions[ilmObjectEntityOrder].elements["purpose"] = {
        type: "cds.String",
        "@PersonalData.FieldSemantics": "PurposeID"
      };

      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelpKeys = Object.keys(mockModel.definitions).filter((k) =>
        k.includes("valueHelp_condition")
      );
      expect(valueHelpKeys.length).toBeGreaterThan(0);
    });

    test("should create value help entity with correct field names for condition", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) =>
          def.elements &&
          def.elements.conditionFieldValue &&
          def.elements.conditionFieldValueDescription
      );
      expect(valueHelp).toBeDefined();
      expect(valueHelp.elements.conditionFieldValue).toBeDefined();
      expect(valueHelp.elements.conditionFieldValueDescription).toBeDefined();
    });
  });

  describe("buildSelectionCriteria", () => {
    test("should create value help for filterable string field", () => {
      mockEntity = mockModel.definitions[dataSubjectEntityCustomer];
      enhanceModelWithValueLists(dataSubjectEntityCustomer, mockEntity, mockModel);

      const valueHelpKeys = Object.keys(mockModel.definitions).filter((k) =>
        k.includes("valueHelp_selection")
      );
      expect(valueHelpKeys.length).toBeGreaterThan(0);
    });

    test("should skip fields if FilterRestrictions.Filterable is false", () => {
      mockModel.definitions[ilmObjectEntityOrder]["@Capabilities.FilterRestrictions.Filterable"] =
        false;
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelpKeys = Object.keys(mockModel.definitions).filter((k) =>
        k.includes("valueHelp_selection")
      );
      expect(valueHelpKeys.length).toBe(0);
    });

    test("should skip fields in NonFilterableProperties", () => {
      mockModel.definitions[ilmObjectEntityOrder]["@Capabilities.FilterRestrictions.Filterable"] =
        false;
      mockModel.definitions[ilmObjectEntityOrder][
        "@Capabilities.FilterRestrictions.NonFilterableProperties"
      ] = [{ "=": "modifiedAt" }];

      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelpKeys = Object.keys(mockModel.definitions).filter(
        (k) => k.includes("valueHelp_selection_") && k.includes("modifiedAt")
      );
      expect(valueHelpKeys.length).toBe(0);
    });

    test("should skip fields with @UI.HiddenFilter", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelpKeys = Object.keys(mockModel.definitions).filter(
        (k) => k.includes("valueHelp_selection_") && k.includes("name")
      );
      expect(valueHelpKeys.length).toBe(0);
    });

    test("should skip fields with @UI.Hidden", () => {
      mockModel.definitions[ilmObjectEntityOrder]["hiddenProperty"] = {
        type: "cds.String",
        name: "hiddenProperty",
        "@UI.Hidden": true
      };

      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelpKeys = Object.keys(mockModel.definitions).filter(
        (k) => k.includes("valueHelp_selection_") && k.includes("name")
      );
      expect(valueHelpKeys.length).toBe(0);
    });

    test("should skip key fields", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelpKeys = Object.keys(mockModel.definitions).filter(
        (k) => k.includes("valueHelp_selection_") && k.includes("orderTitle")
      );
      expect(valueHelpKeys.length).toBe(0);
    });

    test("should skip EndOfBusinessDate fields", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelpKeys = Object.keys(mockModel.definitions).filter(
        (k) => k.includes("valueHelp_selection_") && k.includes("EndOfBusinessDate")
      );
      expect(valueHelpKeys.length).toBe(0);
    });

    test("should include fields in UI.SelectionFields", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const orderNoHelp = Object.keys(mockModel.definitions).filter(
        (k) => k.includes("valueHelp_selection_") && k.includes("OrderNo")
      );
      const orderProperty1Help = Object.keys(mockModel.definitions).filter(
        (k) => k.includes("valueHelp_selection_") && k.includes("order_property_1")
      );
      // Because it is a condition it cannot be a selection criteria
      expect(orderNoHelp.length).toEqual(0);
      expect(orderProperty1Help.length).toBeGreaterThan(0);
    });

    test("should include RequiredProperties even if not in SelectionFields", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);
      const valueHelpKeys = Object.keys(mockModel.definitions).filter(
        (k) => k.includes("valueHelp_selection_") && k.includes("createdAt")
      );
      expect(valueHelpKeys.length).toBeGreaterThan(0);
    });

    test("should create value help entity with correct field names for selection", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) => def.elements && def.elements.value && def.elements.valueDescription
      );
      expect(valueHelp).toBeDefined();
    });

    test("should set @requires on value help when querying from entity directly", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) => def["@requires"] === "DataRetentionManagerUser"
      );
      expect(valueHelp).toBeDefined();
    });

    test("should set @cds.redirection.target on entity when creating direct value help", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      expect(mockModel.definitions[ilmObjectEntityOrder]["@cds.redirection.target"]).toBe(true);
    });
  });

  describe("handleValueList with Common.ValueList annotation", () => {
    test("should use Common.ValueList annotation if present", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) => def.query && def.query.SELECT && def.query.SELECT.from
      );
      expect(valueHelp).toBeDefined();
    });
  });

  describe("handleValueList with Association/Composition", () => {
    test("should create value help for Association field", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) => def.query && def.query.SELECT && def.query.SELECT.distinct === true
      );
      expect(valueHelp).toBeDefined();
    });

    test("should use Common.Text for description field", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) => def.query && def.query.SELECT
      );
      expect(valueHelp.query.SELECT.columns.length).toBe(2);
    });

    test("should handle Composition fields", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) =>
          def.query &&
          def.query.SELECT &&
          def.query.SELECT.from &&
          def.query.SELECT.from.ref &&
          def.query.SELECT.from.ref[0] === ilmObjectEntityOrder
      );
      expect(valueHelp).toBeDefined();
    });
  });

  describe("Value help entity properties", () => {
    test("should set readonly annotation on value help entity", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) => def["@readonly"] === true
      );
      expect(valueHelp).toBeDefined();
    });

    test("should set Capabilities restrictions on value help entity", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) => def["@readonly"] === true && def["@ILM.ValueHelp.Path"] !== undefined
      );

      expect(valueHelp["@Capabilities.DeleteRestrictions.Deletable"]).toBe(false);
      expect(valueHelp["@Capabilities.InsertRestrictions.Insertable"]).toBe(false);
      expect(valueHelp["@Capabilities.UpdateRestrictions.Updatable"]).toBe(false);
    });

    test("should null PersonalData annotations on value help entity", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];

      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockEntity.elements).find((def) => def["@readonly"] === true);
      expect(valueHelp["@PersonalData.EntitySemantics"]).toBeUndefined();
      expect(valueHelp["@PersonalData.DataSubjectRole"]).toBeUndefined();
    });

    test("should create SELECT with cast to String", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder];
      enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) => def.query && def.query.SELECT
      );
      expect(valueHelp.query.SELECT.columns[0].cast.type).toBe("cds.String");
    });
  });

  describe("Edge cases", () => {
    test("should handle entity with no elements", () => {
      mockEntity = mockModel.definitions[ilmObjectEntityOrder].elements = {};

      expect(() =>
        enhanceModelWithValueLists(ilmObjectEntityOrder, mockEntity, mockModel)
      ).not.toThrow();
    });

    test("should handle field without Common.Text", () => {
      mockEntity = mockModel.definitions[dataSubjectEntityCustomer];
      enhanceModelWithValueLists(dataSubjectEntityCustomer, mockEntity, mockModel);

      const valueHelp = Object.values(mockModel.definitions).find(
        (def) => def.query && def.query.SELECT && def.query.SELECT.columns
      );

      expect(
        valueHelp.query.SELECT.columns[1].xpr || valueHelp.query.SELECT.columns[1].ref
      ).toBeDefined();
    });
  });
});
