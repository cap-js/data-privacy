
/**
   * For a given transactional data if the application wants to configure any selection criteria then this endpoint has to be implemented.
    This endpoint would be called by DRM under the following instances:

    To fetch the selection criteria values to display in the value help for the respective transactional data in the user interface while archiving.
    When the archiving of transactional data is trigerred via the archive api passing the selection criteria, the endpoint would be called to check if the given selection criteria is configured, if not we reject the archive request for this transactional data.
    The endpoint should return the list of values and the respective descriptions for the selection criteria of the particular transactional data.
    Note-

    This endpoint will have to be provided in the service instance configuration under:

    retention-configs => dataSubjects => iLMObjects=>destruction => selectionCriteria => valueHelpEndPoint : for destruction
    retention-configs => dataSubjects => iLMObjects=>selectionCriteria => valueHelpEndPoint : for archiving
  */
  //Requirements, that we dynamically set these endpoints up -- Done
action archiveSelectionCriteriaValues () returns array of { //Implement later
    value: String;
    valueDescription: String;
};