using sap.ilm.RetentionService from './DPIRetention';
using {
  sap.ilm.Condition,
  sap.ilm.ReferenceDate
} from '../db/dpi';

@impl: './TableHeaderBlocking.js'
extend service sap.ilm.RetentionService with {

  /**
   * The application must implement this endpoint that checks the state of the
   * business for a given data subject in the context of a data subject role for a
   * given ILM object. This endpoint checks for any open transactions for the data
   * subject for the specified parameters. There are three possible scenarios:
   * 1. In the context of the data subject role, if the data subject has no
   *    associated business for a specified ILM object, the endpoint should return a
   *    204 (No Content) status code without any response payload.
   * 2. In the context of the data subject role, if the business associated with the
   *    data subject for a specified ILM object has ended, the endpoint should return
   *    a status code of 200 (OK) and include a response payload with the field
   *    'dataSubjectExpired' set to true and an empty string for
   *    'dataSubjectNotExpiredReason'.
   * 3. In the context of the data subject role, if there are open business
   *    associated with the data subject for a specified ILM object, the endpoint
   *    should return with a status code of 200 (OK) and include a response payload
   *    with the field 'dataSubjectExpired' set to false. The
   *    'dataSubjectNotExpiredReason' field should contain a displayable message
   *    explaining the reason for the open business.
   *
   * Note: If the endpoint responds with a status code of 204, no further check is
   * done in the context of this ILM object. This endpoint has to be provided in the
   * service instance configuration under: dataPrivacyConfiguration >>
   * retentionConfiguration >> iLMObjects >> dataSubjectBlockingConfiguration >>
   * dataSubjectEndOfBusinessEndPoint
   */
  action dataSubjectEndOfBusiness(
                                  /**
                                   * Name of the application that is registered with DPI NextGen Retention Management
                                   * for which the Data Subject Blocking has been requested
                                   */
                                  applicationName: String,
                                  /**
                                   * Name of the business entity or object that is registered with DPI NextGen
                                   * Retention Management that represents the business data created for the data
                                   * subject
                                   */
                                  iLMObjectName: String,
                                  /**
                                   * Name of the role of the data subject in the business application that is
                                   * registered with DPI NextGen Retention Management for which the blocking or
                                   * deletion has been requested
                                   */
                                  dataSubjectRoleName: String,
                                  /**
                                   * Identifier of the data subject in the business application for whom the blocking
                                   * or deletion is being orchestrated
                                   */
                                  dataSubjectId: String)                             returns {
    /**
     * Flag/Boolean value that denotes if all the business associated with the provided
     * data subject for the provided ILM object is over/done or not. Values: true -
     * business is over | false - business is still open
     */
    dataSubjectExpired          : Boolean;
    /**
     * Display message that can be provided as to why the business is not over/done for
     * the provided data subject for the provided ILM object
     */
    dataSubjectNotExpiredReason : String;
  };

  /**
   * The application must implement this endpoint to returns a list of values for a
   * specified organization attribute where the data subject is involved in business
   * with the application for a specified data subject role and ILM object.
   *
   * There are two possible scenarios:
   * 1. In the context of the data subject role, if the data subject has no
   *    associated business for a specified ILM object, the endpoint should return a
   *    204 (No Content) status code without any response payload.
   * 2. In the context of the data subject role, if there is business associated with
   *    the data subject for the specific ILM object then the endpoint should return
   *    the list of distinct values of the organization attributes where the data
   *    subject is involved in business. The organization attributes should be
   *    returned with the property 'organizationAttributeValue'.
   *
   * Note: If the endpoint responds with a status code of 204, no further check is
   * done in the context of this ILM object.
   */
  action dataSubjectOrganizationAttributeValues(
                                                /**
                                                 * Name of the application that is registered with DPI NextGen Retention Management
                                                 */
                                                applicationName: String,
                                                /**
                                                 * Name of the business entity or object that is registered with DPI NextGen
                                                 * Retention Management that represents the business data created for the data
                                                 * subject
                                                 */
                                                iLMObjectName: String,
                                                /**
                                                 * Name of the role of the data subject in the business application that is
                                                 * registered with DPI NextGen Retention Management
                                                 */
                                                dataSubjectRoleName: String,
                                                /**
                                                 * Identifier of the data subject in the business application for whom the blocking
                                                 * or deletion is being orchestrated
                                                 */
                                                dataSubjectId: String,
                                                /**
                                                 * Name of the attribute or field or property which defines the organizational
                                                 * structure of the business
                                                 */
                                                organizationAttributeName: String, ) returns many {
    /**
     * Value of the organization attribute where the provided data subject is having
     * business for the provided ILM object. Value can be a corporation, an
     * association, or any other organization of a legal capacity that has statutory
     * rights and responsibilities.
     */
    organizationAttributeValue : String
  };

  /**
   * The application must implement this endpoint that returns the latest value of
   * the specified reference date for the business associated with the data subject
   * in the context of a specified data subject role and ILM object for a specified
   * organization attribute value for each retention set provided. These retention
   * sets contain a unique identifier the 'retentionSetId' and an optional condition
   * set which contains the condition field and value. The latest reference date
   * value, along with the corresponding 'retentionSetId', should be returned as part
   * of the property 'retentionStartDate'.
   *
   * There are two possible scenarios:
   * 1. In the context of the data subject role, if the data subject has no
   *    associated business for the specified request, the endpoint should return a
   *    204 (No Content) status code without any response payload.
   * 2. If there is business data available, the endpoint should return a
   *    'retentionStartDate' for each 'retentionSetId' as a list.
   *
   * This endpoint will be triggered for each combination of organization attribute
   * value and reference date with the corresponding configured retention sets.
   */
  action dataSubjectLatestRetentionStartDates(
                                              /**
                                               * Name of the application that is registered with DPI NextGen Retention Management
                                               */
                                              applicationName: String,
                                              /**
                                               * Name of the role of the data subject in the business application that is
                                               * registered with DPI NextGen Retention Management
                                               */
                                              dataSubjectRoleName: String,
                                              /**
                                               * Identifier of the data subject in the business application for whom the blocking
                                               * or deletion is being orchestrated
                                               */
                                              dataSubjectId: String,
                                              /**
                                               * Name of the attribute or field or property which defines the organizational
                                               * structure of the business
                                               */
                                              organizationAttributeName: String,
                                              /**
                                               * Value of the organization attribute where the provided data subject is having
                                               * business for the provided ILM object. Value can be a corporation, an
                                               * association, or any other organization of a legal capacity that has statutory
                                               * rights and responsibilities.
                                               */
                                              organizationAttributeValue: String,
                                              /**
                                               * The date field or property in the business application which is used as the
                                               * reference for denoting the start of retention to calculate the end of retention
                                               * date based on the rules
                                               */
                                              referenceDateName: String,
                                              /**
                                               * Name of the business entity or object that is registered with DPI NextGen
                                               * Retention Management that represents the business data created for the data
                                               * subject
                                               */
                                              iLMObjectName: String,
                                              retentionSet: many {
    /**
     * Identifier of the retention set which contains a unique set of condition sets
     * (combination of condition field name and values)
     */
    retentionSetId     : String;
    /**
     * List of condition sets configured as part of the retention set of the business
     * purpose
     */
    conditionSet       : many Condition;
  })                                                                                 returns array of {
    /**
     * Identifier of the retention set provided as part of the request payload with the
     * corresponding condition set
     */
    retentionSetId     : String;
    /**
     * Latest value of the reference date field or property in the provided ILM object
     * for the provided data subject
     */
    retentionStartDate : String;
  };

  /**
   * The application must implement this endpoint for each ILM object to block or if
   * the provided 'maxDeletionDate' is not in the future then delete the ILM object
   * instances / transactional data associated with the provided data subject in the
   * context of the specified data subject role.
   *
   * There are two possible scenarios:
   * 1. In the context of the data subject role, if the data subject has no
   *    associated business for a specified ILM object, the endpoint should return a
   *    204 (No Content) status code without any response payload.
   * 2. If there is business associated with the data subject for the specified ILM
   *    object in the context of the specified data subject role, the application
   *    should block the ILM object instances if the provided 'maxDeletionDate' is in
   *    the future and if the 'maxDeletionDate' is in the present or in the past, the
   *    application should delete the associated ILM object instances.
   *
   * Note: The specific methods/approach for carrying out the blocking and deletion
   * activities are left to the application's discretion, the recommendation from
   * product standards is to use a blocking flag or a blocking date. It is expected
   * that the application retain the specified 'maxDeletionDate' as part of the ILM
   * object instances to later initiate the deletion.
   *
   * Returns 200 if the instances of the specified ILM object associated with the
   * data subject in the context of the data subject role have been blocked or if the
   * 'maxDeletionDate' is not in the future is then deleted successfully Returns 204
   * if there are no business or ILM object instances associated with the data
   * subject in the context of the specified data subject role
   */
  action dataSubjectILMObjectInstanceBlocking(
                                              /**
                                               * Name of the application that is registered with DPI NextGen Retention Management
                                               */
                                              applicationName: String,
                                              /**
                                               * Name of the role of the data subject in the business application that is
                                               * registered with DPI NextGen Retention Management
                                               */
                                              dataSubjectRoleName: String,
                                              /**
                                               * Name of the business entity or object that is registered with DPI NextGen
                                               * Retention Management that represents the business data created for the data
                                               * subject
                                               */
                                              iLMObjectName: String,
                                              /**
                                               * Identifier of the data subject in the business application for whom the blocking
                                               * or deletion is being orchestrated
                                               */
                                              dataSubjectId: String,
                                              /**
                                               * Maximum retention date that is calculated based on the provided retention start
                                               * dates and the configured retention rules for the provided ILM object for the
                                               * provided data subject
                                               */
                                              maxDeletionDate: String, //REVISIT: String instead of DateTime because SAP DPI Retention sends data in wrong format
  )                                                                                  returns Integer;

  /**
   * The application must implement this endpoint to block or if the provided
   * 'maxDeletionDate' is not in the future then delete the master data associated
   * with the data subject for the specified data subject role. If the
   * 'maxDeletionDate' is in the future, the data subject should be blocked. If the
   * 'maxDeletionDate' is today or in the past, the data subject should be deleted.
   *
   * Note: The specific methods/approach for carrying out the blocking and deletion
   * activities are left to the application's discretion, the recommendation from
   * product standards is to use a blocking flag. It is expected that the application
   * retain the specified 'maxDeletionDate' as part of the data subject reference to
   * later initiate the deletion.
   *
   * Returns 200 if the data subject in the context of the data subject role has been
   * blocked or if the 'maxDeletionDate' is not in the future is then deleted
   * successfully. Returns 204 if the data subject in the context of the data subject
   * role does not exist
   */
  action dataSubjectBlocking(
                             /**
                              * Name of the application that is registered with DPI NextGen Retention Management
                              */
                             applicationName: String,
                             /**
                              * Name of the role of the data subject in the business application that is
                              * registered with DPI NextGen Retention Management
                              */
                             dataSubjectRoleName: String,
                             /**
                              * Identifier of the data subject in the business application for whom the blocking
                              * or deletion is being orchestrated
                              */
                             dataSubjectId: String,
                             /**
                              * Maximum retention date that is calculated based on the provided retention start
                              * dates and the configured retention rules for the provided data subject
                              */
                             maxDeletionDate: String //String instead of DateTime because SAP DPI Retention sends data in wrong format
  )                                                                                  returns String;

  //TODO: Async blocking must be implemented - and check if we have to provide these 4 properties / when DPI would provide them
  /**
   * The request body includes the requestId which was provided by the DPI NextGen
   * service when the asynchronous data subject blocking was triggered, the status of
   * the blocking, the response message associated with the status and a type of the
   * request.
   *
   * Note: The 'requestType' property is included to provide the context of the
   * request to the application and this helps the application for instance to reuse
   * the callback interface for both data subject blocking and archiving
   *
   * Returns 200 if the status of data subject blocking request has been acknowledged
   * successfully
   */
  action dataSubjectBlockingAsyncCallback(
                                          /**
                                           * Identifier of the request that was returned as part of the response to the Data
                                           * Subject Blocking request
                                           */
                                          requestId: String,
                                          /**
                                           * Status of the Data Subject Blocking request Possible values: 0 = New request 1 =
                                           * Request in progress 2 = Request completed 3 = Error in processing the request
                                           */
                                          status: String,
                                          /**
                                           * Response message of the processed request. This would be the stringified version
                                           * of the response that would be returned for a synchronous request.
                                           */
                                          message: String,
                                          /**
                                           * Type of the request. Value would be 'DataSubjectBlocking' for data subject
                                           * blocking requests and the reason for having the 'requestType' is to support
                                           * applications when reusing the callback endpoint for different asynchronous
                                           * operations like data subject blocking and archiving.
                                           */
                                          requestType: String, )                     returns String;

  /**
   * The application must implement this endpoint to delete instances of the ILM
   * object associated with data subjects that were previously blocked until the
   * specified 'maxDeletionDate' and are eligible for deletion today or in the past.
   *
   * Note: This endpoint does not provide any reference to a particular data subject
   * or a list data subjects, but serves as a notification to initiate the deletion
   * process for the eligible ILM object instances.
   *
   * Returns 200 if the ILM object instances that are eligible for deletion are
   * deleted successfully. Returns 202 if the request for ILM object instance
   * deletion accepted successfully and processing will be done asynchronously in the
   * background and no need of any callbacks
   */
  action dataSubjectsILMObjectInstancesDestroying(
                                                  /**
                                                   * Name of the application that is registered with DPI NextGen Retention Management
                                                   */
                                                  applicationName: String,
                                                  /**
                                                   * Name of the role of the data subject in the business application that is
                                                   * registered with DPI NextGen Retention Management
                                                   */
                                                  dataSubjectRoleName: String,
                                                  /**
                                                   * Name of the business entity or object that is registered with DPI NextGen
                                                   * Retention Management that represents the business data created for the data
                                                   * subject
                                                   */
                                                  iLMObjectName: String)             returns String;

  /**
   * The application must implement this endpoint to delete data subjects that were
   * previously blocked using DPI NextGen service until a specified 'maxDeletionDate'
   * and are eligible for deletion today or in the past.
   *
   * Note: This endpoint serves as a notification to initiate the deletion process
   * for the eligible data subjects, without providing any reference to either a
   * specific data subject or a list of data subjects.
   *
   * Returns 200 if the data subjects that are eligible for deletion deleted
   * successfully Returns 202 if the request for data subjects deletion accepted
   * successfully and processing will be done asynchronously in the background and no
   * need of any callbacks
   */
  action dataSubjectsDestroying(
                                /**
                                 * Name of the application that is registered with DPI NextGen Retention Management
                                 */
                                applicationName: String,
                                /**
                                 * Name of the role of the data subject in the business application that is
                                 * registered with DPI NextGen Retention Management
                                 */
                                dataSubjectRoleName: String)                         returns String;

  /**
   * The application must implement an endpoint that provides a list of data subjects
   * that are eligible to be blocked based on the retention start dates provided for
   * each combination of reference date, organization attribute value and condition
   * sets in the context of the specified ILM object and data subject role.
   *
   * To determine eligibility, the endpoint should check for each combination of
   * reference date and organization attribute value for the configured residence
   * sets. If there are no values for the specified reference date greater than the
   * provided 'retentionStartDate' for any residence set, then the data subject is
   * eligible for blocking. This condition must hold true for every residence set and
   * its corresponding reference date and organization attribute value provided.
   *
   * The eligible data subjects are returned as part of the list/array under the
   * 'success' key, while the non-eligible data subjects are returned under the
   * 'nonConfirmCondition' key.
   */
  action dataSubjectsEndOfResidence(
                                    /**
                                     * Name of the application that is registered with DPI NextGen Retention Management
                                     * for which the end of residence/purpose check has been requested
                                     */
                                    applicationName: String,
                                    /**
                                     * Name of the business entity or object that is registered with DPI NextGen
                                     * Retention Management that represents the business data created for the data
                                     * subject
                                     */
                                    iLMObjectName: String,
                                    /**
                                     * Name of the role of the data subject in the business application that is
                                     * registered with DPI NextGen Retention Management for which the end of
                                     * residence/purpose check has been requested
                                     */
                                    dataSubjectRoleName: String,
                                    /**
                                     * List of reference dates that is configured as part of the business purposes
                                     * along with the organization attribute values with the corresponding residence
                                     * sets
                                     */
                                    referenceDates: many ReferenceDate)              returns {
    /**
     * List of data subjects that are eligible to be blocked or deleted for the
     * provided configuration
     */
    success             : many {
      dataSubjectId : String
    };
    /**
     * List of data subjects that are not eligible for deletion
     */
    nonConfirmCondition : many {
      dataSubjectId : String
    };
  };

  /**
   * The application must implement an endpoint that provides a list of data subjects
   * which is the subset of the list provided by the DPI NextGen service that are
   * confirmed to be eligible to be blocked based on the retention start dates
   * provided for each combination of reference date, organization attribute value
   * and condition sets in the context of the specified ILM object and data subject
   * role. This endpoint is only triggered if there are multiple ILM objects
   * configured by the application.
   *
   * The purpose of this endpoint is to confirm the eligibility for blocking of data
   * subjects that are returned as eligible by other ILM objects, but are not
   * included either in the 'success' or 'nonConfirmCondition' lists returned by the
   * specified ILM object.
   */
  action dataSubjectsEndOfResidenceConfirmation(
                                                /**
                                                 * Name of the application that is registered with DPI NextGen Retention Management
                                                 * for which the end of residence/purpose check has been requested
                                                 */
                                                applicationName: String,
                                                /**
                                                 * Name of the business entity or object that is registered with DPI NextGen
                                                 * Retention Management that represents the business data created for the data
                                                 * subject
                                                 */
                                                iLMObjectName: String,
                                                /**
                                                 * Name of the role of the data subject in the business application that is
                                                 * registered with DPI NextGen Retention Management for which the end of
                                                 * residence/purpose check has been requested
                                                 */
                                                dataSubjectRoleName: String,
                                                /**
                                                 * List of identifier of the data subjects for whom the end of residence
                                                 * confirmation is requested
                                                 */
                                                dataSubjects: many {
    dataSubjectId : String
  },
                                                /**
                                                 * List of reference dates that is configured as part of the business purposes
                                                 * along with the organization attribute values with the corresponding residence
                                                 * sets
                                                 */
                                                @mandatory
                                                referenceDates: many ReferenceDate)  returns many {
    /**
     * The data subject from the provided list that are confirmed to be eligible to be
     * blocked for the provided ILM object returned successfully
     */
    dataSubjectId : String
  };

  /**
   * The application must implement this endpoint to provide some additional
   * information, such as the display name and email id, about the data subjects that
   * have been identified as eligible for blocking. This information will be
   * displayed in the user interface of the DPI NextGen service.
   *
   * The endpoint should return the details of all the data subjects whose ids are
   * included in the payload.
   */
  action dataSubjectInformation(
                                /**
                                 * Name of the application that is registered with DPI NextGen Retention Management
                                 * for which the end of residence/purpose check has been requested
                                 */
                                applicationName: String,
                                /**
                                 * Name of the role of the data subject in the business application that is
                                 * registered with DPI NextGen Retention Management for which the end of
                                 * residence/purpose check has been requested
                                 */
                                dataSubjectRoleName: String,
                                /**
                                 * List of data subjects for whom the basic information is required for display
                                 * purposes
                                 */
                                dataSubjects: many {
    dataSubjectId : String
  }, )                                                                               returns many {
    dataSubjectId : String;
    emailId       : String;
    name          : String
  };
}
