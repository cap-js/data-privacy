using {SelectionCriteria} from '../transactional-data-discovery';
using DRMService from '../../drm-service';

/**
   * This endpoint needs to be implemented by the application to handle the destruction requests that are triggered from DRM in the production mode.
    For each transactional data instance that is passed in the payload if the retentionEndDate that has already been persisted for it is on or before the current date then, those transactional record instances are eligible for destruction and the application can delete these records as the retention period has been crossed.
    Note -
      this endpoint should be provided in the service instance configuration under
      retention-configs => dataSubjects => legalGrounds => destruction => legalGroundDestructionEndpoint
   */
  action destruction (
    requestId: String,
    legalGroundName: String,
    selectionCriteria: array of SelectionCriteria,
  ) returns {
    requestId: String; //Value in example was not in UUID Format
    requestStatusCode: Integer;
    requestStatusMessage: String;
  };

  /**
   * This endpoint has to be implemented by the application to check the transactional data instances that are eligible for destruction when destruction is triggered from DRM in the simulation mode.
    The transactional records whose retentionEndDate is on or before the current date are eligible for destruction.
    Note - 
      this endpoint should be provided in the service instance configuration under
      retention-configs =>dataSubjects => legalGrounds => destruction => legalGroundDestructionSimulationEndpoint
   */
  action simulateDestruction (
    requestId: String,
    legalGroundName: String,
    selectionCriteria: array of SelectionCriteria,
  ) returns {
    requestId: String; //Value in example was not in UUID Format
    requestStatusCode: Integer;
    requestStatusMessage: String;
  };


  extend service DRMService with {
      action destruction (
        requestId: String,
        legalGroundName: String,
        selectionCriteria: array of SelectionCriteria,
    ) returns {
        requestId: String; //Value in example was not in UUID Format
        requestStatusCode: Integer;
        requestStatusMessage: String;
    };

    action simulateDestruction (
        requestId: String,
        legalGroundName: String,
        selectionCriteria: array of SelectionCriteria,
    ) returns {
        requestId: String; //Value in example was not in UUID Format
        requestStatusCode: Integer;
        requestStatusMessage: String;
    };
}