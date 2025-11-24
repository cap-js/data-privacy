const cds = require('@sap/cds');

Object.defineProperty(cds.builtin.classes.service.prototype, '_dpi', {
  get() {
    const srv = this;
    return {
      get dataSubjects() {
        return srv._collect(d =>
          d.kind === 'entity' &&
          (d['@PersonalData.DataSubjectRole'] || d['@PersonalData.DataSubjectRole']?.['=']) &&
          d['@PersonalData.EntitySemantics'] === 'DataSubject'
        )
      },
      /**
       * @param {string} role Name of Data Subject role to look for
       * @returns Linked List of all data subject entities in this service who are assigned to the given role or have a dynamic role
       */
      dataSubjectsForRole: function dataSubjectsForRole(role) {
        const resultWithRole = new cds.builtin.classes.LinkedDefinitions
        for (const dataSubject in srv._dpi.dataSubjects) {
          if (srv._dpi.dataSubjects[dataSubject]['@PersonalData.DataSubjectRole'] === role || srv._dpi.dataSubjects[dataSubject]['@PersonalData.DataSubjectRole']?.['=']) {
            resultWithRole[dataSubject] = srv._dpi.dataSubjects[dataSubject];
          }
        }
        return resultWithRole;
      },
      get iLMObjects() {
        return srv._collect(d =>
          d.kind === 'entity' && d['@PersonalData.EntitySemantics'] === 'Other'
        )
      },
      iLMObjectsForRole: function iLMObjectsForRole(role) {
        const resultWithRole = new cds.builtin.classes.LinkedDefinitions
        for (const dataSubject in srv._dpi.iLMObjects) {
          if (srv._dpi.iLMObjects[dataSubject]['@PersonalData.DataSubjectRole'] === role || srv._dpi.iLMObjects[dataSubject]['@PersonalData.DataSubjectRole']?.['=']) {
            resultWithRole[dataSubject] = srv._dpi.iLMObjects[dataSubject];
          }
        }
        return resultWithRole;
      },
    }
  },
});