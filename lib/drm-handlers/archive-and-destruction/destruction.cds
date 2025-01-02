using {SelectionCriteria} from '../data-discovery';
using DRMService from '../../drm-service';

extend service DRMService with {
  action destruction (
    applicationName: String,
    runId: String,
    iLMObjectName: String,
    selectionCriteria: array of SelectionCriteria,
  ) returns {
    requestId: String; //Value in example was not in UUID Format
    requestStatusCode: Integer;
    requestStatusMessage: String;
  };

  action simulateDestruction (
    applicationName: String,
    runId: String,
    iLMObjectName: String,
    selectionCriteria: array of SelectionCriteria,
  ) returns {
    requestId: String; //Value in example was not in UUID Format
    requestStatusCode: Integer;
    requestStatusMessage: String;
  };
}