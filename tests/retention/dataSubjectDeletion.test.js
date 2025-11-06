const cds = require('@sap/cds');
const path = require('path');

let { POST: _POST } = cds.test().in(path.join(__dirname, '../bookshop-app'))
const POST = async function() {
  try {
      return await _POST(...arguments)
  } catch (e) {
      return e.response ?? e;
  }
}
cds.test.data.autoReset(true);
const DPI_Service = { username: 'dpi', password: '1234' }

describe('data subject deletion', () => {

  describe('deletion', () => {
      test('dataSubjectEndOfBusiness returns true if all objects have reached end of business', async () => {
        const {status, data} = await POST('/dpp/retention/dataSubjectEndOfBusiness', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
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
        const {status, data} = await POST('/dpp/retention/dataSubjectEndOfBusiness', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
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
        const {status, data} = await POST('/dpp/retention/dataSubjectOrganizationAttributeValues', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
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
        const {status, data} = await POST('/dpp/retention/dataSubjectOrganizationAttributeValues', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          organizationAttributeName: 'legalEntity_name'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(400);
        expect(data.error.code).toEqual('ORG_ATTRIBUTE_NOT_EXISTING');
      })

      test('dataSubjectOrganizationAttributeValues returns error if org attribute is not annotated as DataControllerID', async () => {
        const {status, data} = await POST('/dpp/retention/dataSubjectOrganizationAttributeValues', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          organizationAttributeName: 'ID'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(400);
        expect(data.error.code).toEqual('ORG_ATTRIBUTE_NOT_EXISTING');
      })

      test('dataSubjectLatestRetentionStartDates', async () => {
        const {status, data} = await POST('/dpp/retention/dataSubjectLatestRetentionStartDates', {
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
    
        expect(status).toEqual(200);
        expect(data.length).toEqual(1);
        expect(data[0]).toMatchObject({
          retentionSetId: 'ABC',
          retentionStartDate: '2020-04-04T00:00:00'
        });
      })

      test('dataSubjectILMObjectInstanceBlocking returns amount of blocked instances', async () => {
        const {Orders} = cds.entities('sap.capire.bookshop');
        const {status, data} = await POST('/dpp/retention/dataSubjectILMObjectInstanceBlocking', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: '2020-04-04T22:00:00'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(200);
        expect(data).toEqual(1);        
        const orderAfterBlocking = await SELECT.from(Orders).where({ID: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(orderAfterBlocking.length).toEqual(1);
        expect(orderAfterBlocking[0].dppBlockingDate.startsWith(new Date().toISOString().substring(0, 10))).toBeTruthy()
        expect(orderAfterBlocking[0].dppEarliestDestructionDate.startsWith('2020-04-04')).toBeTruthy()
      })

      test('dataSubjectILMObjectInstanceBlocking returns 204 when no instances where active', async () => {
        const {Orders} = cds.entities('sap.capire.bookshop')
        await DELETE.from(Orders);
        const {status} = await POST('/dpp/retention/dataSubjectILMObjectInstanceBlocking', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: '2020-04-03T22:00:00'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(204);
      })

      test('dataSubjectsILMObjectInstancesDestroying', async () => {
        const {Orders} = cds.entities('sap.capire.bookshop');
        await POST('/dpp/retention/dataSubjectILMObjectInstanceBlocking', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: '2020-04-04T22:00:00'
        }, { auth: DPI_Service });
        const blockingBeforeDelete = await SELECT.from(Orders).where({ID: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingBeforeDelete.length).toEqual(1);
        expect(blockingBeforeDelete[0].dppBlockingDate).toBeTruthy();
        expect(blockingBeforeDelete[0].dppEarliestDestructionDate).toEqual('2020-04-04');

        await POST('/dpp/retention/dataSubjectsILMObjectInstancesDestroying', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
          dataSubjectRoleName: 'Customer', 
        }, { auth: DPI_Service });

        const blockingAfter = await SELECT.from(Orders).where({ID: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter.length).toEqual(0);
      })

      test('dataSubjectsILMObjectInstancesDestroying not destroyed if deletion date in future', async () => {
        const {Orders} = cds.entities('sap.capire.bookshop');
        const maxDeletionDate = new Date()
        maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1)
        await POST('/dpp/retention/dataSubjectILMObjectInstanceBlocking', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: maxDeletionDate.toISOString()
        }, { auth: DPI_Service });
        const blockingBeforeDelete = await SELECT.from(Orders).where({ID: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingBeforeDelete.length).toEqual(1);
        expect(blockingBeforeDelete[0].dppBlockingDate).toBeTruthy();
        expect(blockingBeforeDelete[0].dppEarliestDestructionDate).toEqual(maxDeletionDate.toISOString().substring(0,10));

        await POST('/dpp/retention/dataSubjectsILMObjectInstancesDestroying', {
          applicationName: 'bookshop-retention', 
          iLMObjectName: 'Orders', 
          dataSubjectRoleName: 'Customer', 
        }, { auth: DPI_Service });

        const blockingAfter = await SELECT.from(Orders).where({ID: '5e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter.length).toEqual(1);
        expect(blockingAfter[0].dppBlockingDate).toBeTruthy();
        expect(blockingAfter[0].dppEarliestDestructionDate).toEqual(maxDeletionDate.toISOString().substring(0,10));
      })

      test('dataSubjectBlocking returns 400 if active records exist', async () => {
        const {status} = await POST('/dpp/retention/dataSubjectBlocking', {
          applicationName: 'bookshop-retention', 
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
        await UPDATE.entity(Orders).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'}).set({
          dppBlockingDate: new Date().toISOString().substring(0,10),
          dppEarliestDestructionDate: "2020-01-02T00:00:00Z"
        });
        await UPDATE.entity(Marketing).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'}).set({
          dppBlockingDate: new Date().toISOString().substring(0,10),
          dppEarliestDestructionDate: "2020-01-02T00:00:00Z"
        });
        const maxDeletionDate = new Date()
        maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1)
        const {status} = await POST('/dpp/retention/dataSubjectBlocking', {
          applicationName: 'bookshop-retention', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: maxDeletionDate.toISOString()
        }, { auth: DPI_Service });
    
        expect(status).toEqual(200);
        const blockingAfter = await SELECT.from(Customers).where({ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter.length).toEqual(1);
        expect(blockingAfter[0].dppBlockingDate).toBeTruthy();
        expect(blockingAfter[0].dppEarliestDestructionDate).toEqual(maxDeletionDate.toISOString().substring(0,10));
      })

      test('dataSubjectBlocking deletes if maxDeletion date is already past', async () => {
        const {Orders, Marketing, Customers} = cds.entities('sap.capire.bookshop')
        await DELETE.from(Orders).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        await DELETE.from(Marketing).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        const {status} = await POST('/dpp/retention/dataSubjectBlocking', {
          applicationName: 'bookshop-retention', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: '2020-01-01'
        }, { auth: DPI_Service });
    
        expect(status).toEqual(200);
        const customers = await SELECT.from(Customers).where({ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        expect(customers.length).toEqual(0)
      })

      test('dataSubjectsDestroying does not destroy if end of retention not reached', async () => {
        const {Orders, Marketing, Customers} = cds.entities('sap.capire.bookshop')
        await DELETE.from(Orders).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        await DELETE.from(Marketing).where({Customer_ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'})
        const maxDeletionDate = new Date()
        maxDeletionDate.setFullYear(maxDeletionDate.getFullYear() + 1)
        await POST('/dpp/retention/dataSubjectBlocking', {
          applicationName: 'bookshop-retention', 
          dataSubjectRoleName: 'Customer', 
          dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
          maxDeletionDate: maxDeletionDate.toISOString()
        }, { auth: DPI_Service });
    
        const blockingBefore = await SELECT.from(Customers).where({ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingBefore.length).toEqual(1);
        expect(blockingBefore[0].dppBlockingDate).toBeTruthy();
        expect(blockingBefore[0].dppEarliestDestructionDate).toEqual(maxDeletionDate.toISOString().substring(0,10));
        
        const {status} = await POST('/dpp/retention/dataSubjectsDestroying', {
          applicationName: 'bookshop-retention', 
          dataSubjectRoleName: 'Customer', 
        }, { auth: DPI_Service });
        expect(status).toEqual(204);

        const blockingAfter = await SELECT.from(Customers).where({ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(blockingAfter[0].dppBlockingDate).toBeTruthy();
        expect(blockingAfter[0].dppEarliestDestructionDate).toEqual(maxDeletionDate.toISOString().substring(0,10));
        expect(blockingAfter.length).toEqual(1);
      })

      test('dataSubjectsDestroying does destroy if end of retention reached', async () => {
        const {Customers} = cds.entities('sap.capire.bookshop')
        await UPDATE.entity(Customers).where({ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'}).set({
          dppBlockingDate: new Date().toISOString().substring(0,10),
          dppEarliestDestructionDate: "2020-01-02T00:00:00Z"
        })
        
        const {status} = await POST('/dpp/retention/dataSubjectsDestroying', {
          applicationName: 'bookshop-retention', 
          dataSubjectRoleName: 'Customer', 
        }, { auth: DPI_Service });
        expect(status).toEqual(200);

        const customerAfterBlocking = await SELECT.from(Customers).where({ID: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'});
        expect(customerAfterBlocking.length).toEqual(0);
      })
  });

  describe('Validate applicationName', () => {
    test('dataSubjectsEndOfResidenceEndPoint', async () => {
      const {status, data} = await POST('/dpp/retention/dataSubjectsEndOfResidence', {
        applicationName: 'ABCDEFG', 
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
        ]
      }, { auth: DPI_Service });
  
      expect(status).toEqual(400);
      expect(data).toMatchObject({
        error: {
          code: 'WRONG_APPLICATION_NAME',
          message: expect.any(String),
          target: 'applicationName'
        }
      });
    })
  })

  describe('eligible for deletion', () => {

    test('dataSubjectsEndOfResidence returns eligible data subjects for deletion', async () => {
      const {status, data} = await POST('/dpp/retention/dataSubjectsEndOfResidence', {
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
      const {status, data} = await POST('/dpp/retention/dataSubjectsEndOfResidence', {
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
  
      expect(status).toEqual(200);
      expect(data).toMatchObject({
        success: [],
        nonConfirmCondition: []
      });
    })

    test('dataSubjectsEndOfResidenceConfirmation confirms data subjects end of residence', async () => {
      const {status, data} = await POST('/dpp/retention/dataSubjectsEndOfResidenceConfirmation', {
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
          {dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'}
        ]
      }, { auth: DPI_Service });
  
      expect(status).toEqual(200);
      expect(data.length).toEqual(1);
      expect(data[0]).toMatchObject({
        dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
      });
    })

    test('dataSubjectsEndOfResidenceConfirmation returns no data subjects if no data subjects are passed', async () => {
      const { ILMObjectWithXPRBlockingEnabled } = cds.entities('sap.capire.bookshop');
      await DELETE.from(ILMObjectWithXPRBlockingEnabled).where('1 = 1')

      const {status, data} = await POST('/dpp/retention/dataSubjectsEndOfResidenceConfirmation', {
        applicationName: 'bookshop-retention', 
        iLMObjectName: 'ILMObjectWithXPRBlockingEnabled', 
        dataSubjectRoleName: 'Customer', 
        referenceDates: [
          {
            referenceDateName: 'marketingDate',
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
          
        ]
      }, { auth: DPI_Service });
  
      expect(status).toEqual(200);
      expect(data.length).toEqual(0);
    })

    test('dataSubjectsEndOfResidenceConfirmation returns the data subjects if they do not have any business with the specified ILMObject', async () => {
      const { ILMObjectWithXPRBlockingEnabled } = cds.entities('sap.capire.bookshop');
      await DELETE.from(ILMObjectWithXPRBlockingEnabled).where('1 = 1')

      const {status, data} = await POST('/dpp/retention/dataSubjectsEndOfResidenceConfirmation', {
        applicationName: 'bookshop-retention', 
        iLMObjectName: 'ILMObjectWithXPRBlockingEnabled', 
        dataSubjectRoleName: 'Customer', 
        referenceDates: [
          {
            referenceDateName: 'marketingDate',
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
          { dataSubjectId: '9e2f2640-6866-4dcf-8f4d-3027aa831cad' },
          { dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad' },
          { dataSubjectId: '74e718c9-ff99-47f1-8ca3-950c850777d4' }
        ]
      }, { auth: DPI_Service });
  
      expect(status).toEqual(200);
      expect(data.length).toEqual(3);
      expect(data[0]).toMatchObject({
        dataSubjectId: '9e2f2640-6866-4dcf-8f4d-3027aa831cad',
      });
      expect(data[1]).toMatchObject({
        dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad',
      });
      expect(data[2]).toMatchObject({
        dataSubjectId: '74e718c9-ff99-47f1-8ca3-950c850777d4',
      });
    })

    test('dataSubjectsEndOfResidence properly considers org attribute', async () => {
      const {status, data} = await POST('/dpp/retention/dataSubjectsEndOfResidenceConfirmation', {
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
        ],
        dataSubjects: [
          {dataSubjectId: '8e2f2640-6866-4dcf-8f4d-3027aa831cad'}
        ]
      }, { auth: DPI_Service });
  
      expect(status).toEqual(200);
      expect(data.length).toEqual(0);
    })

    test('dataSubjectsEndOfResidenceConfirmation with empty reference dates still works', async () => {
      const {status, data} = await POST('/dpp/retention/dataSubjectsEndOfResidenceConfirmation', {
        applicationName: 'bookshop-retention', 
        iLMObjectName: 'Orders', 
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
      const {status, data} = await POST('/dpp/retention/dataSubjectInformation', {
        applicationName: 'bookshop-retention', 
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