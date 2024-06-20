using DRMService from '../../drm-service';

action deleteDataSubjectMaster (
    applicationGroup: String,
    dataSubjectRole: String,
    dataSubjectId: String,
    deletionDate: String, //String instead of DateTime because DRM sends data in wrong format
    retentionStartDate: String, //String instead of DateTime because DRM sends data in wrong format
    purposeStatus: Integer
);

extend service DRMService with {
    action deleteDataSubjectMaster (
        applicationGroup: String,
        dataSubjectRole: String,
        dataSubjectId: String,
        deletionDate: String,
        retentionStartDate: String,
        purposeStatus: Integer
    );
}