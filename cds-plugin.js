const cds = require('@sap/cds'), fs = require("fs"), path = require("path")
/*
    Logic for drm addition
    General plan: 3 step tier

    1. Fully automated - drm including all actions + entities is added automatically
        -> When no DRMService / service with path drm is defined for the app, but PersonalData annotations are in the data model
        -> Adding the service + all actions for DRM
        -> Entities with PersonalData annotated are added to the service

    2. Partially automated - DRM service is defined by the app and cds only adds actions
        -> DRMService / service with path drm  is defined. We only add all actions + implementations to the service
        -> Offer setting: autoComplete entities: When activated all entities with the annotations which are not added 
            explicitly are added automatically. Done so that if only one entity has to be overridden, it works fine.

    3. Manual implementation - App does everything and we do not interviene
        -> If an action is specified in the DRMService we do not add our handler for it
        -> We offer utils api to interact with blocking store + helper functions to handle requests


    //TODO:
        - Generate i18n folder for drm automatically
        - Align on common DRM-API set we would offer
        - Implement object store from HANA
        - Concept for distributed services
            - External services: How to consider? Just change the URL part in transactional-data-discovery?
            - How to consider applicationGroups concept from DRM

*/

let servicesLoaded = false, DRMServiceLoaded = false

cds.on('loaded', async m => {
    if (DRMServiceLoaded) return
    const namespaces = {}
    let drmServiceString = `service DRMService {`, importString = ''
    const namespaceString = (namespace, entity) => {
        if (namespaces[namespace]) return namespaces[namespace]
        namespaces[namespace] = `import${Object.entries(namespaces).length}`
        importString += `using { ${namespace} as ${namespaces[namespace]} } from '${entity.$location.file}';`;
        return namespaces[namespace]
    } 
    for (let each in m.definitions) {
        let def = m.definitions[each]
        if (def.kind === 'service' && !servicesLoaded && !def['@cds.provided']) servicesLoaded = true
        if (
            def.kind === 'service' && 
            !def['@cds.provided'] && (each === 'DRMService' || (def['@path'] && (def['@path'] === '/drm' || def['@path'] === 'drm')))
        )
            DRMServiceLoaded = true
        //Scenario 2 - only add actions
        if (!def.query && !def.projection && def.kind === 'entity' && def['@PersonalData.EntitySemantics']) {
            const entityName = each.split('.')[each.split('.').length-1]
            const namespace = each.substring(0,each.length-1-entityName.length)
            drmServiceString += `entity ${entityName} as projection on ${namespaceString(namespace, def)}.${entityName};`
        }
    }
    drmServiceString += '};' //Closing service def

    //Scenario 1 - DRM adds everything
    const drmModel = cds.compile({'*': m, 'drm-service.cds': importString + drmServiceString}, {silent: true})
    drmModel.definitions.DRMService = fullDRMService.DRMService;
    drmModel.definitions.DRMService['@impl'] = path.join(__dirname, '/srv/drm-service.js')
    Object.assign(m.definitions, fullDRMService)
    for (const each in drmModel.definitions) {
        if (each.startsWith('DRMService') && !m.definitions[each]) {
            Object.assign(m.definitions, {[each]: drmModel.definitions[each]})
        }
    }
})

//cds.load(path.join(__dirname, '/srv/drm-service.cds')) -> if in package defs are changed, this needs to change as well
const fullDRMService = {
    "sap.capire.blocking.BlockingStore": {
      kind: "entity",
      includes: [
        "cuid",
        "managed",
      ],
      elements: {
        ID: {
          key: true,
          type: "cds.UUID",
        },
        createdAt: {
          "@cds.on.insert": {
            "=": "$now",
          },
          "@UI.HiddenFilter": true,
          "@Core.Immutable": true,
          "@title": "{i18n>CreatedAt}",
          "@readonly": true,
          type: "cds.Timestamp",
        },
        createdBy: {
          "@cds.on.insert": {
            "=": "$user",
          },
          "@UI.HiddenFilter": true,
          "@Core.Immutable": true,
          "@title": "{i18n>CreatedBy}",
          "@readonly": true,
          "@description": "{i18n>UserID.Description}",
          type: "User",
          length: 255,
        },
        modifiedAt: {
          "@cds.on.insert": {
            "=": "$now",
          },
          "@cds.on.update": {
            "=": "$now",
          },
          "@UI.HiddenFilter": true,
          "@title": "{i18n>ChangedAt}",
          "@readonly": true,
          type: "cds.Timestamp",
        },
        modifiedBy: {
          "@cds.on.insert": {
            "=": "$user",
          },
          "@cds.on.update": {
            "=": "$user",
          },
          "@UI.HiddenFilter": true,
          "@title": "{i18n>ChangedBy}",
          "@readonly": true,
          "@description": "{i18n>UserID.Description}",
          type: "User",
          length: 255,
        },
        ObjectType: {
          type: "cds.String",
        },
        ObjectKey: {
          type: "cds.String",
        },
        ObjectAsBlob: {
          type: "cds.LargeString",
        },
        DataSubjectID: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        EndOfRetentionDate: {
          type: "cds.DateTime",
        },
      },
    },
    DRMService: {
      kind: "service",
      "@requires": "DataRetentionManagerUser",
      "@protocol": "rest",
      "@cds.provided": true,
      "@path": "/drm",
    },
    endOfResidence: {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        selectionCriteria: {
          items: {
            type: "SelectionCriteria",
          },
        },
        excludedLegalEntities: {
          items: {
            type: "cds.String",
          },
        },
        retentionStartDate: {
          type: "cds.String",
        },
        startTime: {
          type: "cds.String",
        },
        conditionSet: {
          items: {
            elements: {
              businessPurposeName: {
                type: "cds.String",
              },
              legalGroundName: {
                type: "cds.String",
              },
              ruleIdentifier: {
                type: "cds.Integer",
              },
              ruleIdentifierGuid: {
                type: "cds.UUID",
              },
              conditionFieldName: {
                type: "cds.String",
              },
              conditionFieldValue: {
                type: "cds.String",
              },
            },
          },
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        residenceRuleId: {
          type: "cds.String",
        },
        legalEntity: {
          type: "cds.String",
        },
      },
      returns: {
        elements: {
          residenceRuleId: {
            type: "cds.String",
          },
          legalGroundInstancesArchiveCount: {
            type: "cds.Integer",
          },
          legalGroundInstances: {
            items: {
              elements: {
                keys: {
                  items: {
                    elements: {
                      key: {
                        type: "cds.String",
                      },
                      value: {
                        type: "cds.String",
                      },
                    },
                  },
                },
                retentionStartDate: {
                  type: "cds.DateTime",
                },
              },
            },
          },
          deltatoken: {
            type: "cds.String",
          },
        },
      },
    },
    archive: {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        legalGroundArchiveResidenceRules: {
          items: {
            elements: {
              legalGroundInstances: {
                items: {
                  elements: {
                    retentionEndDate: {
                      type: "cds.DateTime",
                    },
                    keys: {
                      items: {
                        elements: {
                          key: {
                            type: "cds.String",
                          },
                          value: {
                            type: "cds.String",
                          },
                        },
                      },
                    },
                    retentionStartDate: {
                      type: "cds.DateTime",
                    },
                  },
                },
              },
              residenceRuleId: {
                type: "cds.UUID",
              },
            },
          },
        },
        startTime: {
          type: "cds.String",
        },
      },
      returns: {
        elements: {
          success: {
            type: "cds.Integer",
          },
          failure: {
            type: "cds.Integer",
          },
        },
      },
    },
    "DRMService.endOfResidence": {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        selectionCriteria: {
          items: {
            type: "SelectionCriteria",
          },
        },
        excludedLegalEntities: {
          items: {
            type: "cds.String",
          },
        },
        retentionStartDate: {
          type: "cds.String",
        },
        startTime: {
          type: "cds.String",
        },
        conditionSet: {
          items: {
            elements: {
              businessPurposeName: {
                type: "cds.String",
              },
              legalGroundName: {
                type: "cds.String",
              },
              ruleIdentifier: {
                type: "cds.Integer",
              },
              ruleIdentifierGuid: {
                type: "cds.UUID",
              },
              conditionFieldName: {
                type: "cds.String",
              },
              conditionFieldValue: {
                type: "cds.String",
              },
            },
          },
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        residenceRuleId: {
          type: "cds.String",
        },
        legalEntity: {
          type: "cds.String",
        },
      },
      returns: {
        elements: {
          residenceRuleId: {
            type: "cds.String",
          },
          legalGroundInstancesArchiveCount: {
            type: "cds.Integer",
          },
          legalGroundInstances: {
            items: {
              elements: {
                keys: {
                  items: {
                    elements: {
                      key: {
                        type: "cds.String",
                      },
                      value: {
                        type: "cds.String",
                      },
                    },
                  },
                },
                retentionStartDate: {
                  type: "cds.DateTime",
                },
              },
            },
          },
          deltatoken: {
            type: "cds.String",
          },
        },
      },
    },
    "DRMService.archive": {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        legalGroundArchiveResidenceRules: {
          items: {
            elements: {
              legalGroundInstances: {
                items: {
                  elements: {
                    retentionEndDate: {
                      type: "cds.DateTime",
                    },
                    keys: {
                      items: {
                        elements: {
                          key: {
                            type: "cds.String",
                          },
                          value: {
                            type: "cds.String",
                          },
                        },
                      },
                    },
                    retentionStartDate: {
                      type: "cds.DateTime",
                    },
                  },
                },
              },
              residenceRuleId: {
                type: "cds.UUID",
              },
            },
          },
        },
        startTime: {
          type: "cds.String",
        },
      },
      returns: {
        elements: {
          success: {
            type: "cds.Integer",
          },
          failure: {
            type: "cds.Integer",
          },
        },
      },
    },
    destruction: {
      kind: "action",
      params: {
        requestId: {
          type: "cds.String",
        },
        legalGroundName: {
          type: "cds.String",
        },
        selectionCriteria: {
          items: {
            type: "SelectionCriteria",
          },
        },
      },
      returns: {
        elements: {
          requestId: {
            type: "cds.String",
          },
          requestStatusCode: {
            type: "cds.Integer",
          },
          requestStatusMessage: {
            type: "cds.String",
          },
        },
      },
    },
    simulateDestruction: {
      kind: "action",
      params: {
        requestId: {
          type: "cds.String",
        },
        legalGroundName: {
          type: "cds.String",
        },
        selectionCriteria: {
          items: {
            type: "SelectionCriteria",
          },
        },
      },
      returns: {
        elements: {
          requestId: {
            type: "cds.String",
          },
          requestStatusCode: {
            type: "cds.Integer",
          },
          requestStatusMessage: {
            type: "cds.String",
          },
        },
      },
    },
    "DRMService.destruction": {
      kind: "action",
      params: {
        requestId: {
          type: "cds.String",
        },
        legalGroundName: {
          type: "cds.String",
        },
        selectionCriteria: {
          items: {
            type: "SelectionCriteria",
          },
        },
      },
      returns: {
        elements: {
          requestId: {
            type: "cds.String",
          },
          requestStatusCode: {
            type: "cds.Integer",
          },
          requestStatusMessage: {
            type: "cds.String",
          },
        },
      },
    },
    "DRMService.simulateDestruction": {
      kind: "action",
      params: {
        requestId: {
          type: "cds.String",
        },
        legalGroundName: {
          type: "cds.String",
        },
        selectionCriteria: {
          items: {
            type: "SelectionCriteria",
          },
        },
      },
      returns: {
        elements: {
          requestId: {
            type: "cds.String",
          },
          requestStatusCode: {
            type: "cds.Integer",
          },
          requestStatusMessage: {
            type: "cds.String",
          },
        },
      },
    },
    dataSubjectLegalEntities: {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        dataSubjectID: {
          type: "cds.String",
        },
      },
      returns: {
        items: {
          elements: {
            legalEntity: {
              type: "cds.String",
            },
          },
        },
      },
    },
    retentionStartDate: {
      kind: "action",
      params: {
        dataSubjectRole: {
          type: "cds.String",
        },
        legalEntity: {
          type: "cds.String",
        },
        startTime: {
          type: "cds.String",
        },
        dataSubjectID: {
          type: "cds.String",
        },
        legalGround: {
          type: "cds.String",
        },
        rulesConditionSet: {
          items: {
            elements: {
              retentionID: {
                type: "cds.String",
              },
              conditionSet: {
                items: {
                  type: "Condition",
                },
              },
            },
          },
        },
      },
      returns: {
        items: {
          elements: {
            retentionID: {
              type: "cds.String",
            },
            retentionStartDate: {
              type: "cds.String",
            },
          },
        },
      },
    },
    dataSubjectEndOfBusiness: {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        dataSubjectID: {
          type: "cds.String",
        },
      },
      returns: {
        elements: {
          dataSubjectExpired: {
            type: "cds.Boolean",
          },
          dataSubjectNotExpiredReason: {
            type: "cds.String",
          },
        },
      },
    },
    deleteDataSubject: {
      kind: "action",
      params: {
        applicationGroupName: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        dataSubjectID: {
          type: "cds.String",
        },
        maxDeletionDate: {
          type: "cds.String",
        },
      },
    },
    destroyDataSubjects: {
      kind: "action",
      params: {
        applicationGroupName: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
      },
    },
    deleteLegalGroundInstances: {
      kind: "action",
      params: {
        dataSubjectID: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        startTime: {
          type: "cds.String",
        },
        maxDeletionDate: {
          type: "cds.String",
        },
        legalGround: {
          type: "cds.String",
        },
        retentionRules: {
          items: {
            type: "RetentionRule",
          },
        },
      },
    },
    RetentionRule: {
      kind: "type",
      elements: {
        legalEntity: {
          type: "cds.String",
        },
        retentionPeriod: {
          type: "cds.Integer",
        },
        retentionUnit: {
          type: "cds.String",
        },
        conditionSet: {
          items: {
            type: "Condition",
          },
        },
      },
    },
    destroyLegalGroundInstances: {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
      },
    },
    "DRMService.dataSubjectLegalEntities": {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        dataSubjectID: {
          type: "cds.String",
        },
      },
      returns: {
        items: {
          elements: {
            legalEntity: {
              type: "cds.String",
            },
          },
        },
      },
    },
    "DRMService.retentionStartDate": {
      kind: "action",
      params: {
        dataSubjectRole: {
          type: "cds.String",
        },
        legalEntity: {
          type: "cds.String",
        },
        startTime: {
          type: "cds.String",
        },
        dataSubjectID: {
          type: "cds.String",
        },
        legalGround: {
          type: "cds.String",
        },
        rulesConditionSet: {
          items: {
            elements: {
              retentionID: {
                type: "cds.String",
              },
              conditionSet: {
                items: {
                  type: "Condition",
                },
              },
            },
          },
        },
      },
      returns: {
        items: {
          elements: {
            retentionID: {
              type: "cds.String",
            },
            retentionStartDate: {
              type: "cds.String",
            },
          },
        },
      },
    },
    "DRMService.dataSubjectEndOfBusiness": {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        dataSubjectID: {
          type: "cds.String",
        },
      },
      returns: {
        elements: {
          dataSubjectExpired: {
            type: "cds.Boolean",
          },
          dataSubjectNotExpiredReason: {
            type: "cds.String",
          },
        },
      },
    },
    "DRMService.deleteDataSubject": {
      kind: "action",
      params: {
        applicationGroupName: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        dataSubjectID: {
          type: "cds.String",
        },
        maxDeletionDate: {
          type: "cds.String",
        },
      },
    },
    "DRMService.destroyDataSubjects": {
      kind: "action",
      params: {
        applicationGroupName: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
      },
    },
    "DRMService.deleteLegalGroundInstances": {
      kind: "action",
      params: {
        dataSubjectID: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        startTime: {
          type: "cds.String",
        },
        maxDeletionDate: {
          type: "cds.String",
        },
        legalGround: {
          type: "cds.String",
        },
        retentionRules: {
          items: {
            type: "DRMService.RetentionRule",
          },
        },
      },
    },
    "DRMService.RetentionRule": {
      kind: "type",
      elements: {
        legalEntity: {
          type: "cds.String",
        },
        retentionPeriod: {
          type: "cds.Integer",
        },
        retentionUnit: {
          type: "cds.String",
        },
        conditionSet: {
          items: {
            type: "Condition",
          },
        },
      },
    },
    "DRMService.destroyLegalGroundInstances": {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
      },
    },
    endOfResidenceDS: {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        startTime: {
          type: "cds.String",
        },
        legalEntitiesResidenceRules: {
          items: {
            elements: {
              legalEntity: {
                type: "cds.String",
              },
              residenceRules: {
                items: {
                  elements: {
                    residenceDate: {
                      type: "cds.String",
                    },
                    conditionSet: {
                      items: {
                        type: "Condition",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      returns: {
        elements: {
          success: {
            items: {
              elements: {
                dataSubjectID: {
                  type: "cds.String",
                },
              },
            },
          },
          nonConfirmCondition: {
            items: {
              elements: {
                dataSubjectID: {
                  type: "cds.String",
                },
              },
            },
          },
        },
      },
    },
    endOfResidenceDSConfirmation: {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        startTime: {
          type: "cds.String",
        },
        dataSubjects: {
          items: {
            elements: {
              dataSubjectID: {
                type: "cds.String",
              },
            },
          },
        },
        legalEntitiesResidenceRules: {
          items: {
            elements: {
              legalEntity: {
                type: "cds.String",
              },
              residenceRules: {
                items: {
                  elements: {
                    residenceDate: {
                      type: "cds.String",
                    },
                    conditionSet: {
                      items: {
                        type: "Condition",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      returns: {
        items: {
          elements: {
            dataSubjectID: {
              type: "cds.String",
            },
          },
        },
      },
    },
    dataSubjectInformation: {
      kind: "action",
      params: {
        applicationGroupName: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        dataSubjectIds: {
          items: {
            type: "cds.String",
          },
        },
      },
      returns: {
        items: {
          elements: {
            dataSubjectId: {
              type: "cds.String",
            },
            emailId: {
              type: "cds.String",
            },
            name: {
              type: "cds.String",
            },
          },
        },
      },
    },
    "DRMService.endOfResidenceDS": {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        startTime: {
          type: "cds.String",
        },
        legalEntitiesResidenceRules: {
          items: {
            elements: {
              legalEntity: {
                type: "cds.String",
              },
              residenceRules: {
                items: {
                  elements: {
                    residenceDate: {
                      type: "cds.String",
                    },
                    conditionSet: {
                      items: {
                        type: "Condition",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      returns: {
        elements: {
          success: {
            items: {
              elements: {
                dataSubjectID: {
                  type: "cds.String",
                },
              },
            },
          },
          nonConfirmCondition: {
            items: {
              elements: {
                dataSubjectID: {
                  type: "cds.String",
                },
              },
            },
          },
        },
      },
    },
    "DRMService.endOfResidenceDSConfirmation": {
      kind: "action",
      params: {
        legalGround: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        startTime: {
          type: "cds.String",
        },
        dataSubjects: {
          items: {
            elements: {
              dataSubjectID: {
                type: "cds.String",
              },
            },
          },
        },
        legalEntitiesResidenceRules: {
          items: {
            elements: {
              legalEntity: {
                type: "cds.String",
              },
              residenceRules: {
                items: {
                  elements: {
                    residenceDate: {
                      type: "cds.String",
                    },
                    conditionSet: {
                      items: {
                        type: "Condition",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      returns: {
        items: {
          elements: {
            dataSubjectID: {
              type: "cds.String",
            },
          },
        },
      },
    },
    "DRMService.dataSubjectInformation": {
      kind: "action",
      params: {
        applicationGroupName: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        dataSubjectIds: {
          items: {
            type: "cds.String",
          },
        },
      },
      returns: {
        items: {
          elements: {
            dataSubjectId: {
              type: "cds.String",
            },
            emailId: {
              type: "cds.String",
            },
            name: {
              type: "cds.String",
            },
          },
        },
      },
    },
    legalEntities: {
      kind: "entity",
      "@readonly": true,
      elements: {
        dataSubjectRole: {
          key: true,
          type: "cds.String",
        },
        value: {
          type: "cds.String",
        },
        valueDesc: {
          type: "cds.String",
        },
      },
    },
    "DRMService.legalEntities": {
      kind: "entity",
      "@readonly": true,
      elements: {
        dataSubjectRole: {
          key: true,
          type: "cds.String",
        },
        value: {
          type: "cds.String",
        },
        valueDesc: {
          type: "cds.String",
        },
      },
    },
    deleteDataSubjectMaster: {
      kind: "action",
      params: {
        applicationGroup: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        dataSubjectId: {
          type: "cds.String",
        },
        deletionDate: {
          type: "cds.String",
        },
        retentionStartDate: {
          type: "cds.String",
        },
        purposeStatus: {
          type: "cds.Integer",
        },
      },
    },
    "DRMService.deleteDataSubjectMaster": {
      kind: "action",
      params: {
        applicationGroup: {
          type: "cds.String",
        },
        dataSubjectRole: {
          type: "cds.String",
        },
        dataSubjectId: {
          type: "cds.String",
        },
        deletionDate: {
          type: "cds.String",
        },
        retentionStartDate: {
          type: "cds.String",
        },
        purposeStatus: {
          type: "cds.Integer",
        },
      },
    },
    Condition: {
      kind: "type",
      elements: {
        conditionFieldName: {
          type: "cds.String",
        },
        conditionFieldValue: {
          type: "cds.String",
        },
      },
    },
    SelectionCriteria: {
      kind: "type",
      elements: {
        name: {
          type: "cds.String",
        },
        value: {
          type: "cds.String",
        },
        valueRange: {
          elements: {
            from: {
              type: "cds.String",
            },
            to: {
              type: "cds.String",
            },
          },
        },
      },
    },
    legalGrounds: {
      kind: "entity",
      "@readonly": true,
      elements: {
        ID: {
          key: true,
          type: "cds.UUID",
        },
      },
    },
    "DRMService.legalGrounds": {
      kind: "entity",
      "@readonly": true,
      elements: {
        ID: {
          key: true,
          type: "cds.UUID",
        },
      },
    },
  }