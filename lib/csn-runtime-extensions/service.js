const cds = require('@sap/cds');

cds.extend(cds.builtin.classes.service).with(
  class {
    get _dpi() {
      const srv = this;
      return {
        get dataSubjects() {
          delete this.dataSubjects;
          this.dataSubjects = srv._collect(
            (d) =>
              d.kind === 'entity' &&
              (d['@PersonalData.DataSubjectRole'] || d['@PersonalData.DataSubjectRole']?.['=']) &&
              d['@PersonalData.EntitySemantics'] === 'DataSubject',
          );
          return this.dataSubjects;
        },
        /**
         * @param {string} role Name of Data Subject role to look for
         * @returns Linked List of all data subject entities in this service who are assigned to the given role or have a dynamic role
         */
        dataSubjectsForRole: function dataSubjectsForRole(role) {
          const resultWithRole = new cds.builtin.classes.LinkedDefinitions();
          for (const dataSubject in srv._dpi.dataSubjects) {
            if (
              srv._dpi.dataSubjects[dataSubject]['@PersonalData.DataSubjectRole'] === role ||
              srv._dpi.dataSubjects[dataSubject]['@PersonalData.DataSubjectRole']?.['=']
            ) {
              resultWithRole[dataSubject] = srv._dpi.dataSubjects[dataSubject];
            }
          }
          return resultWithRole;
        },
        get iLMObjects() {
          delete this.iLMObjects;
          this.iLMObjects = srv._collect(
            (d) => d.kind === 'entity' && d['@PersonalData.EntitySemantics'] === 'Other',
          );
          return this.iLMObjects;
        },
        iLMObjectsForRole: function iLMObjectsForRole(role) {
          const resultWithRole = new cds.builtin.classes.LinkedDefinitions();
          for (const dataSubject in srv._dpi.iLMObjects) {
            if (
              srv._dpi.iLMObjects[dataSubject]['@PersonalData.DataSubjectRole'] === role ||
              srv._dpi.iLMObjects[dataSubject]['@PersonalData.DataSubjectRole']?.['=']
            ) {
              resultWithRole[dataSubject] = srv._dpi.iLMObjects[dataSubject];
            }
          }
          return resultWithRole;
        },
      };
    }
  },
);
