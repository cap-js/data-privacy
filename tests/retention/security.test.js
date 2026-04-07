const cds = require('@sap/cds');
const path = require('path');

let {
  POST: _POST,
  GET: _GET,
  PATCH,
  data,
} = cds.test().in(path.join(__dirname, '../bookshop-app'));
const POST = async function () {
  try {
    return await _POST(...arguments);
  } catch (e) {
    return e.response ?? e;
  }
};
const GET = async function () {
  try {
    return await _GET(...arguments);
  } catch (e) {
    return e.response ?? e;
  }
};

beforeEach(async () => {
  const user = new cds.User({ id: 'privileged', roles: {} });
  user._is_privileged = true;
  const ctx = cds.EventContext.for({ id: cds.utils.uuid(), http: { req: null, res: null } });
  ctx.user = user;
  await cds._with(ctx, () => data.reset());
});
//TODO: Test that entities of DPIRetention service are not exposed via API

describe('SAP DPI Retention endpoints cannot be accessed with an unauthorized user', () => {
  const DPI_Service = { username: 'abc', password: '1234' };
  test('dataSubjectEndOfBusiness', async () => {
    const { status } = await POST(
      '/dpp/retention/dataSubjectEndOfBusiness',
      {
        applicationName: 'bookshop-retention',
        iLMObjectName: 'Orders',
        dataSubjectRoleName: 'Customer',
        dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
      },
      { auth: DPI_Service },
    );
    expect(status).toEqual(403);
  });

  test('dataSubjectOrganizationAttributeValues', async () => {
    const { status } = await POST(
      '/dpp/retention/dataSubjectOrganizationAttributeValues',
      {
        applicationName: 'bookshop-retention',
        iLMObjectName: 'Orders',
        dataSubjectRoleName: 'Customer',
        dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
        organizationAttributeName: 'legalEntity_title',
      },
      { auth: DPI_Service },
    );
    expect(status).toEqual(403);
  });

  test('dataSubjectLatestRetentionStartDates', async () => {
    const { status } = await POST(
      '/dpp/retention/dataSubjectLatestRetentionStartDates',
      {
        applicationName: 'bookshop-retention',
        iLMObjectName: 'Orders',
        dataSubjectRoleName: 'Customer',
        dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
        organizationAttributeName: 'legalEntity_title',
        organizationAttributeValue: 'SAP Ltd',
        referenceDateName: 'endOfWarrantyDate',
        retentionSet: [
          {
            retentionSetId: 'ABC',
            conditionSet: [],
          },
        ],
      },
      { auth: DPI_Service },
    );
    expect(status).toEqual(403);
  });

  test('dataSubjectILMObjectInstanceBlocking', async () => {
    const { status } = await POST(
      '/dpp/retention/dataSubjectILMObjectInstanceBlocking',
      {
        applicationName: 'bookshop-retention',
        iLMObjectName: 'Orders',
        dataSubjectRoleName: 'Customer',
        dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
        maxDeletionDate: '2020-04-04T22:00:00',
      },
      { auth: DPI_Service },
    );
    expect(status).toEqual(403);
  });

  test('dataSubjectBlocking', async () => {
    const { status } = await POST(
      '/dpp/retention/dataSubjectBlocking',
      {
        applicationName: 'bookshop-retention',
        dataSubjectRoleName: 'Customer',
        dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
        maxDeletionDate: '2020-04-04T22:00:00',
      },
      { auth: DPI_Service },
    );
    expect(status).toEqual(403);
  });

  test('dataSubjectsILMObjectInstancesDestroying', async () => {
    const { status } = await POST(
      '/dpp/retention/dataSubjectsILMObjectInstancesDestroying',
      {
        applicationName: 'bookshop-retention',
        iLMObjectName: 'Orders',
        dataSubjectRoleName: 'Customer',
      },
      { auth: DPI_Service },
    );
    expect(status).toEqual(403);
  });

  test('dataSubjectsDestroying', async () => {
    const { status } = await POST(
      '/dpp/retention/dataSubjectsDestroying',
      {
        applicationName: 'bookshop-retention',
        dataSubjectRoleName: 'Customer',
      },
      { auth: DPI_Service },
    );
    expect(status).toEqual(403);
  });

  test('dataSubjectsEndOfResidence', async () => {
    const { status } = await POST(
      '/dpp/retention/dataSubjectsEndOfResidence',
      {
        applicationName: 'bookshop-retention',
        iLMObjectName: 'Orders',
        dataSubjectRoleName: 'Customer',
        referenceDates: [
          {
            referenceDateName: 'endOfWarrantyDate',
            organizationAttributeResidenceSet: [
              {
                organizationAttributeName: 'legalEntity_title',
                organizationAttributeValue: 'SAP SE',
                residenceSet: [
                  {
                    retentionStartDate: '2024-12-20',
                    conditionSet: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      { auth: DPI_Service },
    );
    expect(status).toEqual(403);
  });

  test('dataSubjectsEndOfResidenceConfirmation', async () => {
    const { status } = await await POST(
      '/dpp/retention/dataSubjectsEndOfResidenceConfirmation',
      {
        applicationName: 'bookshop-retention',
        iLMObjectName: 'Orders',
        dataSubjectRoleName: 'Customer',
        referenceDates: [
          {
            referenceDateName: 'endOfWarrantyDate',
            organizationAttributeResidenceSet: [
              {
                organizationAttributeName: 'legalEntity_title',
                organizationAttributeValue: 'SAP Ltd',
                residenceSet: [
                  {
                    retentionStartDate: '2024-12-20',
                    conditionSet: [],
                  },
                ],
              },
            ],
          },
        ],
        dataSubjects: [{ dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad' }],
      },
      { auth: DPI_Service },
    );
    expect(status).toEqual(403);
  });

  test('dataSubjectInformation', async () => {
    const { status } = await POST(
      '/dpp/retention/dataSubjectInformation',
      {
        applicationName: 'bookshop-retention',
        dataSubjectRoleName: 'Customer',
        dataSubjects: [{ dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad' }],
      },
      { auth: DPI_Service },
    );
    expect(status).toEqual(403);
  });

  test('i18n files', async () => {
    const { status } = await GET('/dpp/retention/i18n-files', { auth: DPI_Service });
    expect(status).toEqual(403);

    const { status: status2 } = await GET('/dpp/retention/i18n-files/i18n.properties', {
      auth: DPI_Service,
    });
    expect(status2).toEqual(403);
  });
});

test('DPIRetention entities are not accessible on the API', async () => {
  for (const entity of Object.keys(cds.entities('sap.ilm.RetentionService')).filter(
    (e) =>
      e !== 'iLMObjects' &&
      e !== 'i18n-files' &&
      !e.startsWith('valueHelp') &&
      !e.endsWith('.texts'),
  )) {
    if (
      Object.keys(cds.entities('sap.ilm.RetentionService')[entity]).some((k) =>
        k.startsWith('@PersonalData'),
      )
    ) {
      const { status } = await GET(`/dpp/retention/${entity}`, {
        auth: { username: 'dpi', password: '1234' },
      });
      expect(String(status).substring(0, 2)).toEqual('40');
    }
  }
});

describe('Access Restrictions for blocked entities', () => {
  const regularUser = { username: 'alice', password: '1234' };
  const catalogAuditor = { username: 'catalog-auditor', password: '1234' };
  const customerAuditor = { username: 'customer-auditor', password: '1234' };
  const defaultAuditor = { username: 'auditor', password: '1234' };

  beforeEach(async () => {
    const { Orders, Customers } = cds.entities('sap.capire.bookshop');
    await UPDATE.entity(Orders)
      .where({ ID: '5e2f2640-6866-4dcf-8f4d-3027aa831cad' })
      .set({ dppBlockingDate: '2023-12-12' });
    await UPDATE.entity(Customers)
      .where({ ID: 'e872239b-1283-4384-bf14-711e4b18a1b8' })
      .set({ dppBlockingDate: '2023-12-12' });
  });

  test('Blocked records cannot be read via regular service', async () => {
    const {
      data: { value: orders },
      status,
    } = await GET('/odata/v4/admin/Orders', { auth: regularUser });
    expect(status).toEqual(200);
    expect(orders.some((o) => o.ID === '5e2f2640-6866-4dcf-8f4d-3027aa831cad')).toBeFalsy();

    const {
      data: { value: customers },
      status: statusCustomers,
    } = await GET('/odata/v4/catalog/Customers', { auth: regularUser });
    expect(statusCustomers).toEqual(200);
    expect(customers.some((o) => o.ID === 'e872239b-1283-4384-bf14-711e4b18a1b8')).toBeFalsy();
  });

  test('Blocked records cannot be read via regular service even when using $apply', async () => {
    const {
      data: { value: orders },
      status,
    } = await GET(
      '/odata/v4/catalog/Orders?$apply=groupby((legalEntity_title),aggregate(OrderNo with sum as TotalOrderNumber))/aggregate(TotalOrderNumber with avg as avgOrderNumber)',
      { auth: regularUser },
    );
    expect(status).toEqual(200);
    expect(orders[0].avgOrderNumber).toEqual(22);
  });

  test('Blocked records can be read via regular service if user is default auditor', async () => {
    const {
      data: { value: orders },
      status,
    } = await GET('/odata/v4/admin/Orders', { auth: defaultAuditor });
    expect(status).toEqual(200);
    expect(orders.some((o) => o.ID === '5e2f2640-6866-4dcf-8f4d-3027aa831cad')).toBeTruthy();
  });

  test('Blocked records can be read via regular service if user is custom defined auditor of entity', async () => {
    const {
      data: { value: customers },
      status,
    } = await GET('/odata/v4/catalog/Customers', { auth: customerAuditor });
    expect(status).toEqual(200);
    expect(customers.some((o) => o.ID === 'e872239b-1283-4384-bf14-711e4b18a1b8')).toBeTruthy();
  });

  test('Blocked records cannot be read by service default auditor if entity specific auditor is defined', async () => {
    const {
      data: { value: customers },
      status,
    } = await GET('/odata/v4/catalog/Customers', { auth: catalogAuditor });
    expect(status).toEqual(200);
    expect(customers.some((o) => o.ID === 'e872239b-1283-4384-bf14-711e4b18a1b8')).toBeFalsy();
  });

  test('Blocked records cannot be read by default auditor if entity specific auditor is defined', async () => {
    const {
      data: { value: customers },
      status,
    } = await GET('/odata/v4/catalog/Customers', { auth: defaultAuditor });
    expect(status).toEqual(200);
    expect(customers.some((o) => o.ID === 'e872239b-1283-4384-bf14-711e4b18a1b8')).toBeFalsy();
  });

  test('Blocked records can be read via regular service if user is custom defined auditor of service', async () => {
    const {
      data: { value: orders },
      status,
    } = await GET('/odata/v4/catalog/Orders', { auth: catalogAuditor });
    expect(status).toEqual(200);
    expect(orders.some((o) => o.ID === '5e2f2640-6866-4dcf-8f4d-3027aa831cad')).toBeTruthy();
  });

  test('Blocked records cannot be read via regular service if user is auditor but service level default is defined', async () => {
    const {
      data: { value: orders },
      status,
    } = await GET('/odata/v4/catalog/Orders', { auth: defaultAuditor });
    expect(status).toEqual(200);
    expect(orders.some((o) => o.ID === '5e2f2640-6866-4dcf-8f4d-3027aa831cad')).toBeFalsy();
  });

  test('Draft tables of DPP entities are not blocked', async () => {
    const { data: newOrder } = await POST(
      '/odata/v4/admin/Orders',
      {
        OrderNo: '123',
        currency_code: 'DE',
        endOfWarrantyDate: '2020-12-12',
        legalEntity_title: 'SAP SE',
      },
      { auth: regularUser },
    );

    const savedOrder = await POST(
      `/odata/v4/admin/Orders(ID=${newOrder.ID},IsActiveEntity=false)/AdminService.draftActivate`,
      {},
      { auth: regularUser },
    );
    expect(savedOrder.status).toEqual(201);
    expect(savedOrder.data.endOfWarrantyDate).toEqual('2020-12-12');

    const editOrder = await POST(
      `/odata/v4/admin/Orders(ID=${newOrder.ID},IsActiveEntity=true)/AdminService.draftEdit`,
      {},
      { auth: regularUser },
    );
    expect(editOrder.status).toEqual(201);
    expect(editOrder.data.endOfWarrantyDate).toEqual('2020-12-12');

    const patchedOrder = await PATCH(
      `/odata/v4/admin/Orders(ID=${newOrder.ID},IsActiveEntity=false)`,
      {
        endOfWarrantyDate: '2021-12-12',
      },
      { auth: regularUser },
    );
    expect(patchedOrder.status).toEqual(200);
    expect(patchedOrder.data.endOfWarrantyDate).toEqual('2021-12-12');

    const getDraft = await GET(`/odata/v4/admin/Orders(ID=${newOrder.ID},IsActiveEntity=false)`, {
      auth: regularUser,
    });
    expect(getDraft.status).toEqual(200);
    expect(getDraft.data.endOfWarrantyDate).toEqual('2021-12-12');

    const saveOrder = await POST(
      `/odata/v4/admin/Orders(ID=${newOrder.ID},IsActiveEntity=false)/AdminService.draftActivate`,
      {},
      { auth: regularUser },
    );
    expect(saveOrder.status).toEqual(200);
    expect(saveOrder.data.endOfWarrantyDate).toEqual('2021-12-12');
  });

  test('sap.ilm.RetentionService entities do not have restricted access', async () => {
    const user = new cds.User({
      id: 'dpi',
      roles: { DataRetentionManagerUser: 1, InvalidRoleSoEntitiesCannotBeAccessedViaAPI: 1 },
    });
    const RetentionService = await cds.connect.to('sap.ilm.RetentionService');
    const ctx = cds.EventContext.for({ id: cds.utils.uuid(), http: { req: null, res: null } });
    ctx.user = user;
    const orders = await cds._with(ctx, () =>
      RetentionService.run(SELECT.from(RetentionService.entities.Orders)),
    );
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.some((o) => o.ID === '5e2f2640-6866-4dcf-8f4d-3027aa831cad')).toBeTruthy();
  });

  test('sap.dpp.InformationService entities do not have restricted access', async () => {
    const user = new cds.User({ id: 'dpi', roles: { PersonalDataManagerUser: 1 } });
    const InformationService = await cds.connect.to('sap.dpp.InformationService');
    const ctx = cds.EventContext.for({ id: cds.utils.uuid(), http: { req: null, res: null } });
    ctx.user = user;
    const orders = await cds._with(ctx, () =>
      InformationService.run(SELECT.from(InformationService.entities.Orders)),
    );
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.some((o) => o.ID === '5e2f2640-6866-4dcf-8f4d-3027aa831cad')).toBeTruthy();
  });
});
