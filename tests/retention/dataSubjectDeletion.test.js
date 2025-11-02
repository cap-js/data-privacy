const cds = require('@sap/cds');

let { POST: _POST } = cds.test().in(__dirname)
const POST = async function() {
  try {
      return await _POST(...arguments)
  } catch (e) {
      return e.response ?? e;
  }
}
require('../utils/fast-tests');
cds.test.data.autoReset(true);
const DPI_Service = { username: 'dpi', password: '1234' }

describe('data subject deletion', () => {

  describe('deletion', () => {
      test('dataSubjectEndOfBusiness returns true if all objects have reached end of business', async () => {
        const {status, data} = await POST('/drm/dataSubjectEndOfBusiness', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(200);
        expect(data).toMatchObject({
          dataSubjectExpired: true,
          dataSubjectNotExpiredReason: expect.any(String)
        });
      });

      test('dataSubjectEndOfBusiness returns false if >0 objects have not reached end of business', async () => {
        const {Orders} = cds.entities('sap.capire.bookshop')
        const endOfWarrantyDate = new Date()
        endOfWarrantyDate.setFullYear(endOfWarrantyDate.getFullYear() + 1)
        await UPDATE.entity(Orders).set({endOfWarrantyDate: endOfWarrantyDate.toISOString()})
        const {status, data} = await POST('/drm/dataSubjectEndOfBusiness', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(200);
        expect(data).toMatchObject({
          dataSubjectExpired: false,
          dataSubjectNotExpiredReason: expect.any(String)
        });
      })
    
      test('dataSubjectOrganizationAttributeValues returns attribute values', async () => {
        const {status, data} = await POST('/drm/dataSubjectOrganizationAttributeValues', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          organizationAttributeName: 'legalEntity_title'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(200);
        expect(data.length).toBeGreaterThan(0)
        expect(data[0]).toMatchObject({
          organizationAttributeValue: "SAP Ltd"
        });
      })

      test('dataSubjectOrganizationAttributeValues returns error if org attribute does not exist', async () => {
        const {status, data} = await POST('/drm/dataSubjectOrganizationAttributeValues', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          organizationAttributeName: 'legalEntity_name'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(400);
        expect(data.error.code).toEqual('ORG_ATTRIBUTE_NOT_EXISTING');
      })

      test('dataSubjectOrganizationAttributeValues returns error if org attribute is not annotated as DataControllerID', async () => {
        const {status, data} = await POST('/drm/dataSubjectOrganizationAttributeValues', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          organizationAttributeName: 'ID'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(400);
        expect(data.error.code).toEqual('ORG_ATTRIBUTE_NOT_EXISTING');
      })

      test('dataSubjectLatestRetentionStartDates', async () => {
        const {status, data} = await POST('/drm/dataSubjectLatestRetentionStartDates', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
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
    
        expect(status).toEqual(200);
        expect(data.length).toEqual(1);
        expect(data[0]).toMatchObject({
          retentionSetId: 'ABC',
          retentionStartDate: '2020-04-04T00:00:00'
        });
      })

      test('dataSubjectILMObjectInstanceBlocking returns amount of blocked instances', async () => {
        const {BlockingStore} = cds.entities('sap.capire.blocking');
        const {status, data} = await POST('/drm/dataSubjectILMObjectInstanceBlocking', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: '2020-04-04T22:00:00'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(200);
        expect(data).toEqual(1);        
        const blockingAfter = await SELECT.from(BlockingStore).where({objectKey: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter.length).toEqual(1);
      })

      test('dataSubjectILMObjectInstanceBlocking returns 204 when no instances where active', async () => {
        const {Orders} = cds.entities('sap.capire.bookshop')
        await DELETE.from(Orders);
        const {status} = await POST('/drm/dataSubjectILMObjectInstanceBlocking', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: '2020-04-03T22:00:00'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(204);
      })

      test('dataSubjectsILMObjectInstancesDestroying', async () => {
        const {BlockingStore} = cds.entities('sap.capire.blocking');
        await POST('/drm/dataSubjectILMObjectInstanceBlocking', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: '2020-04-04T22:00:00'
        }, { auth: DPI_Service });
        const blockingBefore = await SELECT.from(BlockingStore).where({objectKey: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingBefore.length).toEqual(1);

        await POST('/drm/dataSubjectsILMObjectInstancesDestroying', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
        }, { auth: DPI_Service });

        const blockingAfter = await SELECT.from(BlockingStore).where({objectKey: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter.length).toEqual(0);
      })

      test('dataSubjectsILMObjectInstancesDestroying not destroyed if deletion date in future', async () => {
        const {BlockingStore} = cds.entities('sap.capire.blocking');
        const maxDeletionDate = new Date()
        maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1)
        await POST('/drm/dataSubjectILMObjectInstanceBlocking', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: maxDeletionDate.toISOString()
        }, { auth: DPI_Service });
        const blockingBefore = await SELECT.from(BlockingStore).where({objectKey: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingBefore.length).toEqual(1);

        await POST('/drm/dataSubjectsILMObjectInstancesDestroying', {
          applicationName: 'ABC_TEST', 
          iLMObjectName: 'DPIRetentionService.Orders', 
          dataSubjectRoleName: 'Customer', 
        }, { auth: DPI_Service });

        const blockingAfter = await SELECT.from(BlockingStore).where({objectKey: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter.length).toEqual(1);
      })

      test('dataSubjectBlocking returns 400 if active records exist', async () => {
        const {status} = await POST('/drm/dataSubjectBlocking', {
          applicationName: 'ABC_TEST', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: '2020-04-04T22:00:00'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(400);
        const {Orders} = cds.entities('sap.capire.bookshop')
        const orders = await SELECT.from(Orders).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        expect(orders.length).toBeGreaterThan(0)
      })

      test('dataSubjectBlocking blocks if maxDeletion date is in future', async () => {
        const {Orders, Marketing, Customers} = cds.entities('sap.capire.bookshop')
        await DELETE.from(Orders).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        await DELETE.from(Marketing).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        const {BlockingStore} = cds.entities('sap.capire.blocking');
        const maxDeletionDate = new Date()
        maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1)
        const {status} = await POST('/drm/dataSubjectBlocking', {
          applicationName: 'ABC_TEST', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: maxDeletionDate.toISOString()
        }, { auth: DPI_Service });
    
        expect(status).toEqual(204);      
        const blockingAfter = await SELECT.from(BlockingStore).where({objectKey: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter.length).toEqual(1);
        const customers = await SELECT.from(Customers).where({ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        expect(customers.length).toEqual(0)
      })

      test('dataSubjectBlocking deletes if maxDeletion date is already past', async () => {
        const {Orders, Marketing, Customers} = cds.entities('sap.capire.bookshop')
        await DELETE.from(Orders).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        await DELETE.from(Marketing).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        const {BlockingStore} = cds.entities('sap.capire.blocking');
        const {status} = await POST('/drm/dataSubjectBlocking', {
          applicationName: 'ABC_TEST', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: '2020-01-01'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(204);      
        const blockingAfter = await SELECT.from(BlockingStore).where({objectKey: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter.length).toEqual(0);
        const customers = await SELECT.from(Customers).where({ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        expect(customers.length).toEqual(0)
      })

      test('dataSubjectsDestroying does not destroy if end of retention not reached', async () => {
        const {Orders, Marketing, Customers} = cds.entities('sap.capire.bookshop')
        await DELETE.from(Orders).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        await DELETE.from(Marketing).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        const {BlockingStore} = cds.entities('sap.capire.blocking');
        const maxDeletionDate = new Date()
        maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1)
        await POST('/drm/dataSubjectBlocking', {
          applicationName: 'ABC_TEST', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: maxDeletionDate.toISOString()
        }, { auth: DPI_Service });
    
        const blockingBefore = await SELECT.from(BlockingStore).where({objectKey: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingBefore.length).toEqual(1);
        const customers = await SELECT.from(Customers).where({ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        expect(customers.length).toEqual(0)
        
        const {status} = await POST('/drm/dataSubjectsDestroying', {
          applicationName: 'ABC_TEST', 
          dataSubjectRoleName: 'Customer', 
        }, { auth: DPI_Service });
        expect(status).toEqual(204);

        const blockingAfter = await SELECT.from(BlockingStore).where({objectKey: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter.length).toEqual(1);
      })

      test('dataSubjectsDestroying does destroy if end of retention reached', async () => {
        const {Orders, Marketing, Customers} = cds.entities('sap.capire.bookshop')
        await DELETE.from(Orders).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        await DELETE.from(Marketing).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        const {BlockingStore} = cds.entities('sap.capire.blocking');
        await INSERT.into(BlockingStore).entries({
          ID: "ce3d95ea-72b3-4032-a650-e093f6017cc4",
          createdAt: "2025-01-02T11:24:58.252Z",
          createdBy: "dpi",
          modifiedAt: "2020-01-02T11:24:58.252Z",
          modifiedBy: "dpi",
          objectType: "DPIRetentionService.Customers",
          objectKey: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          objectAsBlob: "{\"ID\":\"8e2f2640-6866-4dcf-8f4d-3027aa831cad\",\"createdAt\":\"2019-01-31T00:00:00.000Z\",\"createdBy\":\"admin@business.com\",\"modifiedAt\":\"2019-04-04T00:00:00.000Z\",\"modifiedBy\":\"admin@business.com\",\"email\":\"john.doe@test.com\",\"firstName\":\"John\",\"lastName\":\"Doe\",\"gender\":null,\"dateOfBirth\":\"1970-01-01\",\"legalEntity_title\":\"SAP Ltd\",\"postalAddress_endOfCustomer\":null,\"postalAddress\":{\"ID\":\"1e2f2640-6866-4dcf-8f4d-3027aa831cad\",\"createdAt\":\"2019-01-31T00:00:00.000Z\",\"createdBy\":\"admin@business.com\",\"modifiedAt\":\"2019-04-04T00:00:00.000Z\",\"modifiedBy\":\"admin@business.com\",\"Customer_ID\":\"8e2f2640-6866-4dcf-8f4d-3027aa831cad\",\"street\":\"Hauptstrasse 11\",\"endOfCustomer\":null,\"town\":\"Berlin\",\"country_code\":\"DE\",\"someOtherField\":\"Eine Bemerkung\"},\"billingData\":{\"ID\":\"1e2f2640-6866-4dcf-8f4d-3027aa831cad\",\"createdAt\":\"2019-01-31T00:00:00.000Z\",\"createdBy\":\"admin@business.com\",\"modifiedAt\":\"2019-04-04T00:00:00.000Z\",\"modifiedBy\":\"admin@business.com\",\"Customer_ID\":\"8e2f2640-6866-4dcf-8f4d-3027aa831cad\",\"creditCardNo\":\"2222-1111-6666-7777\"}}",
          dataSubjectID: "8e2f2640-6866-4dcf-8f4d-3027aa831cad",
          dataSubjectRole: "Customer",
          endOfRetentionDate: "2020-01-02T00:00:00Z",
        })
        await DELETE.from(Customers).where({ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        
        const {status} = await POST('/drm/dataSubjectsDestroying', {
          applicationName: 'ABC_TEST', 
          dataSubjectRoleName: 'Customer', 
        }, { auth: DPI_Service });
        expect(status).toEqual(200);

        const blockingAfter = await SELECT.from(BlockingStore).where({objectKey: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter.length).toEqual(0);
      })
  });

  describe('eligible for deletion', () => {

    test('dataSubjectsEndOfResidence returns eligible data subjects for deletion', async () => {
      const {status, data} = await POST('/drm/dataSubjectsEndOfResidence', {
        applicationName: 'ABC_TEST', 
        iLMObjectName: 'DPIRetentionService.Orders',
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
        ]
      }, { auth: DPI_Service });
  
      expect(status).toEqual(200);
      expect(data).toMatchObject({
        success: [
          {dataSubjectId: "74e718c9-ff99-47f1-8ca3-950c850777d4"},
          {dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'},
          {dataSubjectId: '9e2f2640-6866-4dcf-8f4d-3027aa831cad'}
        ],
        nonConfirmCondition: []
      });
    })

    test('dataSubjectsEndOfResidence properly considers org attribute', async () => {
      const {status, data} = await POST('/drm/dataSubjectsEndOfResidence', {
        applicationName: 'ABC_TEST', 
        iLMObjectName: 'DPIRetentionService.Orders',
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
  
      expect(status).toEqual(200);
      expect(data).toMatchObject({
        success: [],
        nonConfirmCondition: []
      });
    })

    test('dataSubjectsEndOfResidenceConfirmation confirms data subjects end of residence', async () => {
      const {status, data} = await POST('/drm/dataSubjectsEndOfResidenceConfirmation', {
        applicationName: 'ABC_TEST', 
        iLMObjectName: 'DPIRetentionService.Orders', 
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
          {dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'}
        ]
      }, { auth: DPI_Service });
  
      expect(status).toEqual(200);
      expect(data.length).toEqual(1);
      expect(data[0]).toMatchObject({
        dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
      });
    })

    test('dataSubjectsEndOfResidence properly considers org attribute', async () => {
      const {status, data} = await POST('/drm/dataSubjectsEndOfResidenceConfirmation', {
        applicationName: 'ABC_TEST', 
        iLMObjectName: 'DPIRetentionService.Orders',
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
        ],
        dataSubjects: [
          {dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'}
        ]
      }, { auth: DPI_Service });
  
      expect(status).toEqual(200);
      expect(data.length).toEqual(0);
    })

    test('dataSubjectsEndOfResidenceConfirmation with empty reference dates still works', async () => {
      const {status, data} = await POST('/drm/dataSubjectsEndOfResidenceConfirmation', {
        applicationName: 'ABC_TEST', 
        iLMObjectName: 'DPIRetentionService.Orders', 
        dataSubjectRoleName: 'Customer', 
        referenceDates: [],
        dataSubjects: [
          {dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'}
        ]
      }, { auth: DPI_Service });
  
      expect(status).toEqual(200);
      expect(data.length).toEqual(1);
      expect(data[0]).toMatchObject({
        dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
      });
    })

    //Used for Value helps
    test('dataSubjectInformation retrieval returns data subject information', async () => {
      const {status, data} = await POST('/drm/dataSubjectInformation', {
        applicationName: 'ABC_TEST', 
        dataSubjectRoleName: 'Customer', 
        dataSubjects: [
          {dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'}
        ]
      }, { auth: DPI_Service });
  
      expect(status).toEqual(200);
      expect(data.length).toEqual(1);
      expect(data[0]).toMatchObject({
        dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
        name: 'John Doe', //Based on @Communication.Contact
        emailId: 'john.doe@test.com'
      });
    })
  });
});