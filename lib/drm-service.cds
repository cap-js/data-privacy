using from './drm-handlers/archive-and-destruction/archive';
using from './drm-handlers/archive-and-destruction/destruction';
using from './drm-handlers/data-subject-deletion/data-subject-deletion';
using from './drm-handlers/data-subject-deletion/data-subject-eligible-for-deletion';
using from './drm-handlers/data-discovery';
using from '../db/generic_blocking_schema';

@requires: 'DataRetentionManagerUser'
@protocol: 'rest'
@cds.provided
service DRMService @(path: '/drm') {

    entity ![i18n-files] {
        key file: String;
    }
};