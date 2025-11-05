const cds = require('@sap/cds');
const path = require('path');

let { POST: _POST, GET: _GET } = cds.test().in(path.join(__dirname, '../bookshop-app'))
const POST = async function () {
  try {
    return await _POST(...arguments)
  } catch (e) {
    return e.response ?? e;
  }
}
const GET = async function () {
  try {
    return await _GET(...arguments)
  } catch (e) {
    return e.response ?? e;
  }
}
cds.test.data.autoReset(true);
//TODO: Test that entities of DPIRetention service are not exposed via API

describe('DRM endpoints cannot be accessed with an unauthorized user', () => {
  const DPI_Service = { username: 'abc', password: '1234' }
  test('dataSubjectEndOfBusiness', async () => {
    const { status } = await POST('/drm/dataSubjectEndOfBusiness', {
      applicationName: 'bookshop-retention',
      iLMObjectName: 'Orders',
      dataSubjectRoleName: 'Customer',
      dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'
    }, { auth: DPI_Service });
    expect(status).toEqual(403);
  });

  test('dataSubjectOrganizationAttributeValues', async () => {
    const { status } = await POST('/drm/dataSubjectOrganizationAttributeValues', {
      applicationName: 'bookshop-retention',
      iLMObjectName: 'Orders',
      dataSubjectRoleName: 'Customer',
      dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
      organizationAttributeName: 'legalEntity_title'
    }, { auth: DPI_Service });
    expect(status).toEqual(403);
  });

  test('dataSubjectLatestRetentionStartDates', async () => {
    const { status } = await POST('/drm/dataSubjectLatestRetentionStartDates', {
      applicationName: 'bookshop-retention',
      iLMObjectName: 'Orders',
      dataSubjectRoleName: 'Customer',
      dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
      organizationAttributeName: 'legalEntity_title',
      organizationAttributeValue: 'SAP Ltd',
      referenceDateName: 'endOfWarrantyDate',
      retentionSet: [{
        retentionSetId: 'ABC',
        conditionSet: []
      }]
    }, { auth: DPI_Service });
    expect(status).toEqual(403);
  })

  test('dataSubjectILMObjectInstanceBlocking', async () => {
    const { status } = await POST('/drm/dataSubjectILMObjectInstanceBlocking', {
      applicationName: 'bookshop-retention',
      iLMObjectName: 'Orders',
      dataSubjectRoleName: 'Customer',
      dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
      maxDeletionDate: '2020-04-04T22:00:00'
    }, { auth: DPI_Service });
    expect(status).toEqual(403);
  })

  test('dataSubjectBlocking', async () => {
    const { status } = await POST('/drm/dataSubjectBlocking', {
      applicationName: 'bookshop-retention',
      dataSubjectRoleName: 'Customer',
      dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
      maxDeletionDate: '2020-04-04T22:00:00'
    }, { auth: DPI_Service });
    expect(status).toEqual(403);
  })

  test('dataSubjectsILMObjectInstancesDestroying', async () => {
    const { status } = await POST('/drm/dataSubjectsILMObjectInstancesDestroying', {
      applicationName: 'bookshop-retention',
      iLMObjectName: 'Orders',
      dataSubjectRoleName: 'Customer',
    }, { auth: DPI_Service });
    expect(status).toEqual(403);
  })

  test('dataSubjectsDestroying', async () => {
    const { status } = await POST('/drm/dataSubjectsDestroying', {
      applicationName: 'bookshop-retention',
      dataSubjectRoleName: 'Customer',
    }, { auth: DPI_Service });
    expect(status).toEqual(403);
  })

  test('dataSubjectsEndOfResidence', async () => {
    const { status } = await POST('/drm/dataSubjectsEndOfResidence', {
      applicationName: 'bookshop-retention',
      iLMObjectName: 'Orders',
      dataSubjectRoleName: 'Customer',
      referenceDates: [
        {
          referenceDateName: 'endOfWarrantyDate',
          organizationAttributeResidenceSet: [{
            organizationAttributeName: 'legalEntity_title',
            organizationAttributeValue: 'SAP SE',
            residenceSet: [{
              retentionStartDate: '2024-12-20',
              conditionSet: []
            }]
          }]
        }
      ]
    }, { auth: DPI_Service });
    expect(status).toEqual(403);
  })

  test('dataSubjectsEndOfResidenceConfirmation', async () => {
    const { status } = await await POST('/drm/dataSubjectsEndOfResidenceConfirmation', {
      applicationName: 'bookshop-retention',
      iLMObjectName: 'Orders',
      dataSubjectRoleName: 'Customer',
      referenceDates: [
        {
          referenceDateName: 'endOfWarrantyDate',
          organizationAttributeResidenceSet: [{
            organizationAttributeName: 'legalEntity_title',
            organizationAttributeValue: 'SAP Ltd',
            residenceSet: [{
              retentionStartDate: '2024-12-20',
              conditionSet: []
            }]
          }]
        }
      ],
      dataSubjects: [
        { dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad' }
      ]
    }, { auth: DPI_Service });
    expect(status).toEqual(403);
  })

  test('dataSubjectInformation', async () => {
    const { status } = await POST('/drm/dataSubjectInformation', {
      applicationName: 'bookshop-retention',
      dataSubjectRoleName: 'Customer',
      dataSubjects: [
        { dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad' }
      ]
    }, { auth: DPI_Service });
    expect(status).toEqual(403);
  })

  test('i18n files', async () => {
    const { status } = await GET('/drm/i18n-files', { auth: DPI_Service });
    expect(status).toEqual(403);

    const { status: status2 } = await GET('/drm/i18n-files/i18n.properties', { auth: DPI_Service });
    expect(status2).toEqual(403);
  })
});

test('DPIRetention entities are not accessible on the API', async () => {
  for (const entity of Object.keys(cds.entities('DPIRetentionService')).filter(e => e !== 'iLMObjects' && e !== 'i18n-files' && !e.startsWith('valueHelp') && !e.endsWith('.texts'))) {
    const {status} = await GET(`/drm/${entity}`, { auth: { username: 'dpi', password: '1234' }});
    expect(status).toEqual(403);
  }
})