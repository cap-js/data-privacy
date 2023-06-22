using from './drm-handlers/archive-and-destruction/archive';
using from './drm-handlers/archive-and-destruction/destruction';
using from './drm-handlers/data-subject-deletion/data-subject-deletion';
using from './drm-handlers/data-subject-deletion/data-subject-eligible-for-deletion';
using from './drm-handlers/data-subject-deletion/legal-entities-and-condition-vh';
using from './drm-handlers/data-subject-deletion/master-data-subject-deletion';
using from './drm-handlers/transactional-data-discovery';

@requires: 'DataRetentionManagerUser' // security check
@protocol: 'rest'
@cds.provided
service DRMService @(path: '/drm') {

};