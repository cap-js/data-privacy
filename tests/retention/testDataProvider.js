const cds = require("@sap/cds");

async function runWithPrivileged(fn) {
  const user = new cds.User({ id: "privileged", roles: {} });
  user._is_privileged = true;
  const ctx = cds.EventContext.for({ id: cds.utils.uuid(), http: { req: null, res: null } });
  ctx.user = user;
  return await cds._with(ctx, () => fn());
}

/**
 * Creates a fresh Customer with all related sub-entities:
 * - CustomerPostalAddress, CustomerBillingData
 * - Order with OrderItems, Deliveries, Payments, ManagedComp2One, UnmanagedComp2One2
 * - Marketing, ILMObjectWithStaticBlockingDisabled, ILMObjectWithEDMJSONBlockingEnabled, ILMObjectWithCustomName
 *
 * All IDs are unique per call, so tests using this function are isolated from each other.
 * Returns an object with all generated IDs.
 */
async function createCustomerTestData() {
  const {
    Customers,
    CustomerPostalAddress,
    CustomerBillingData,
    Orders,
    OrderItems,
    Deliveries,
    Payments,
    ManagedComp2One,
    UnmanagedComp2One2,
    Marketing,
    ILMObjectWithStaticBlockingDisabled,
    ILMObjectWithEDMJSONBlockingEnabled,
    ILMObjectWithCustomName
  } = cds.entities("sap.capire.bookshop");

  const customerId = cds.utils.uuid();
  const orderId = cds.utils.uuid();
  const orderItemId1 = cds.utils.uuid();
  const orderItemId2 = cds.utils.uuid();
  const deliveryId1 = cds.utils.uuid();
  const deliveryId2 = cds.utils.uuid();
  const paymentId = cds.utils.uuid();
  const managedComp2OneId = cds.utils.uuid();
  const unmanagedComp2One2Id = cds.utils.uuid();
  const customerPostalAddressId = cds.utils.uuid();
  const customerBillingDataId = cds.utils.uuid();
  const marketingId = cds.utils.uuid();
  const ilmStaticBlockingDisabledId = cds.utils.uuid();
  const ilmEDMJSONBlockingEnabledId = cds.utils.uuid();
  const ilmCustomNameId = cds.utils.uuid();

  const now = new Date().toISOString();
  const email = `test-${customerId.substring(0, 8)}@test.com`;

  await runWithPrivileged(async () => {
    // Customer
    await INSERT.into(Customers).entries({
      ID: customerId,
      modifiedAt: now,
      createdAt: now,
      createdBy: email,
      modifiedBy: email,
      email,
      firstName: "Test",
      lastName: "Customer",
      dateOfBirth: "1970-01-01",
      legalEntity_title: "SAP Ltd"
    });

    // CustomerPostalAddress
    await INSERT.into(CustomerPostalAddress).entries({
      ID: customerPostalAddressId,
      modifiedAt: now,
      createdAt: now,
      createdBy: email,
      modifiedBy: email,
      Customer_ID: customerId,
      street: "Test Street 1",
      town: "Test City",
      country_code: "DE",
      someOtherField: "Test Remark"
    });

    // CustomerBillingData
    await INSERT.into(CustomerBillingData).entries({
      ID: customerBillingDataId,
      modifiedAt: now,
      createdAt: now,
      createdBy: email,
      modifiedBy: email,
      Customer_ID: customerId,
      creditCardNo: "1111-2222-3333-4444"
    });

    // ManagedComp2One
    await INSERT.into(ManagedComp2One).entries({
      ID: managedComp2OneId,
      propertyWithDPPStuff: `managed-${customerId.substring(0, 8)}`
    });

    // UnmanagedComp2One2
    await INSERT.into(UnmanagedComp2One2).entries({
      ID: unmanagedComp2One2Id,
      order_ID: orderId,
      propertyWithDPPStuff: `dppProperty-${customerId.substring(0, 8)}`
    });

    // Order
    await INSERT.into(Orders).entries({
      ID: orderId,
      modifiedAt: now,
      createdAt: now,
      createdBy: email,
      modifiedBy: email,
      OrderNo: "1",
      currency_code: "USD",
      Customer_ID: customerId,
      endOfWarrantyDate: "2020-04-04",
      legalEntity_title: "SAP Ltd",
      managedComp2one_ID: managedComp2OneId
    });

    // OrderItems
    await INSERT.into(OrderItems).entries([
      {
        ID: orderItemId1,
        amount: 1,
        parent_ID: orderId,
        book_ID: 201,
        netAmount: 11.11
      },
      {
        ID: orderItemId2,
        amount: 1,
        parent_ID: orderId,
        book_ID: 271,
        netAmount: 15
      }
    ]);

    // Deliveries
    await INSERT.into(Deliveries).entries([
      {
        ID: deliveryId1,
        parent_ID: orderItemId1,
        dueDate: "2022-12-12",
        comment: "Test delivery 1"
      },
      {
        ID: deliveryId2,
        parent_ID: orderItemId2,
        dueDate: "2023-12-12",
        comment: "Test delivery 2"
      }
    ]);

    // Payments
    await INSERT.into(Payments).entries({
      ID: paymentId,
      modifiedAt: now,
      createdAt: now,
      createdBy: email,
      modifiedBy: email,
      Order_ID: orderId,
      payDate: "2020-04-04"
    });

    // Marketing
    await INSERT.into(Marketing).entries({
      ID: marketingId,
      modifiedAt: now,
      createdAt: now,
      createdBy: email,
      modifiedBy: email,
      Customer_ID: customerId,
      text: "Test marketing",
      marketingDate: "2020-04-04",
      legalEntity_title: "SAP Ltd"
    });

    // ILMObjectWithStaticBlockingDisabled
    await INSERT.into(ILMObjectWithStaticBlockingDisabled).entries({
      ID: ilmStaticBlockingDisabledId,
      Customer_ID: customerId,
      text: "Test static blocking disabled",
      marketingDate: "2020-04-04",
      legalEntity_title: "SAP Ltd"
    });

    // ILMObjectWithEDMJSONBlockingEnabled
    await INSERT.into(ILMObjectWithEDMJSONBlockingEnabled).entries({
      ID: ilmEDMJSONBlockingEnabledId,
      Customer_ID: customerId,
      text: "Test EDM JSON blocking enabled",
      marketingDate: "2020-04-04",
      legalEntity2_title: "SAP Ltd"
    });

    // ILMObjectWithCustomName
    await INSERT.into(ILMObjectWithCustomName).entries({
      ID: ilmCustomNameId,
      modifiedAt: now,
      createdAt: now,
      createdBy: email,
      modifiedBy: email,
      Customer_ID: customerId,
      text: "Test custom name",
      marketingDate: "2020-04-04",
      legalEntity_title: "SAP Ltd"
    });
  });

  return {
    customerId,
    orderId,
    orderItemIds: [orderItemId1, orderItemId2],
    deliveryIds: [deliveryId1, deliveryId2],
    paymentId,
    managedComp2OneId,
    unmanagedComp2One2Id,
    customerPostalAddressId,
    customerBillingDataId,
    marketingId,
    ilmStaticBlockingDisabledId,
    ilmEDMJSONBlockingEnabledId,
    ilmCustomNameId,
    email
  };
}

/**
 * Creates a fresh Employee with 2 ILMObjectWithXPRBlockingEnabled records.
 * Returns an object with the employee ID and the ILM object IDs.
 */
async function createEmployeeTestData() {
  const { Employees, ILMObjectWithXPRBlockingEnabled } = cds.entities("sap.capire.bookshop");

  const employeeId = cds.utils.uuid();
  const ilmObjectId1 = cds.utils.uuid();
  const ilmObjectId2 = cds.utils.uuid();

  const now = new Date().toISOString();
  const email = `test-${employeeId.substring(0, 8)}@sap.com`;

  await runWithPrivileged(async () => {
    // Employee
    await INSERT.into(Employees).entries({
      ID: employeeId,
      modifiedAt: now,
      createdAt: now,
      createdBy: email,
      modifiedBy: email,
      email,
      firstName: "Test",
      lastName: "Employee",
      legalEntity_title: "SAP SE"
    });

    // ILMObjectWithXPRBlockingEnabled (2 records)
    await INSERT.into(ILMObjectWithXPRBlockingEnabled).entries([
      {
        ID: ilmObjectId1,
        employee_ID: employeeId,
        text: "Test XPR 1",
        marketingDate: "2020-04-04",
        division_ID: "d347dcc7-f176-4211-952d-3850c08ccd3e"
      },
      {
        ID: ilmObjectId2,
        employee_ID: employeeId,
        text: "Test XPR 2",
        marketingDate: "2021-01-01",
        division_ID: "c9d0d42b-547c-4680-b60f-84e1f4df7b3d"
      }
    ]);
  });

  return {
    employeeId,
    ilmObjectIds: [ilmObjectId1, ilmObjectId2],
    email
  };
}

module.exports = { createCustomerTestData, createEmployeeTestData, runWithPrivileged };
