const cds = require('@sap/cds');
const { getTranslationKey } = require('../utils');

Object.defineProperty(cds.builtin.classes.entity.prototype, '_dpi', {
  get() {
    const entity = this;
    return {
      get endOfBusinessReference() {
        for (const element in entity.elements) {
          if (
            entity.elements[element] &&
            entity.elements[element]['@PersonalData.FieldSemantics'] === 'EndOfBusinessDate' &&
            !entity.elements[element].isAssociation
          ) {
            return element;
          }
        }
        return null;
      },
      get blockingDateReference() {
        for (const element in entity.elements) {
          if (
            entity.elements[element] &&
            entity.elements[element]['@PersonalData.FieldSemantics'] === 'BlockingDate' &&
            !entity.elements[element].isAssociation
          ) {
            return element;
          }
        }
        return null;
      },
      get earliestDestructionDateReference() {
        for (const element in entity.elements) {
          if (
            entity.elements[element] &&
            entity.elements[element]['@PersonalData.FieldSemantics'] === 'EndOfRetentionDate' &&
            !entity.elements[element].isAssociation
          ) {
            return element;
          }
        }
        return null;
      },
      get dataSubjectIdReference() {
        for (const element in entity.elements) {
          if (
            entity.elements[element] &&
            entity.elements[element]['@PersonalData.FieldSemantics'] === 'DataSubjectID' &&
            !entity.elements[element].isAssociation
          ) {
            return element;
          }
        }
        return null;
      },

      /**
       * Checks for the element where the vhId matches the @ILM.ValueHelp.Id annotation.
       *
       * @returns element name
       */
      elementByVHId(vhId) {
        for (const element in entity.elements) {
          if (
            entity.elements[element]['@ILM.ValueHelp.Id'] === vhId &&
            !entity.elements[element].isAssociation
          ) {
            return element;
          }
        }
        return null;
      },

      get orgAttributeReference() {
        for (const element in entity.elements) {
          if (
            entity.elements[element] &&
            (entity.elements[element]['@PersonalData.FieldSemantics'] === 'DataControllerID' ||
              entity.elements[element]['@ILM.FieldSemantics'] === 'LineOrganizationAttribute') &&
            !entity.elements[element].isAssociation
          ) {
            return element;
          }
        }
        return null;
      },

      get iLMObject() {
        if (entity['@PersonalData.EntitySemantics'] !== 'Other') {
          return null;
        }
        return {
          get endOfBusinessDates() {
            return Object.entries(entity.elements).reduce((acc, [name, value]) => {
              if (
                value['@PersonalData.FieldSemantics'] === 'EndOfBusinessDate' &&
                value.type !== 'cds.Association' &&
                value.type !== 'cds.Composition'
              ) {
                const startTime = {
                  referenceDateName: name,
                  referenceDateDescription:
                    cds.i18n.labels.for(value) ?? cds.i18n.labels.key4(value),
                  referenceDateDescriptionKey: undefined,
                };
                const descriptionI18nKey = getTranslationKey(value['@Common.Label']);
                if (descriptionI18nKey) {
                  startTime.referenceDateDescriptionKey = descriptionI18nKey;
                }
                acc.push(startTime);
              }
              return acc;
            }, []);
          },
        };
      },

      get dataSubject() {
        if (
          entity['@PersonalData.EntitySemantics'] !== 'DataSubjectDetails' &&
          entity['@PersonalData.EntitySemantics'] !== 'DataSubject'
        ) {
          return null;
        }
        return {
          get name() {
            if (entity['@Communication.Contact.fn']) {
              return entity['@Communication.Contact.fn']['='];
            } else if (entity['@Communication.Contact.n.surname']) {
              let response = '';
              if (entity['@Communication.Contact.n.prefix'])
                response += `${entity['@Communication.Contact.n.prefix']['=']} || ' ' ||`;
              if (entity['@Communication.Contact.n.given'])
                response += `${entity['@Communication.Contact.n.given']['=']} || ' ' ||`;
              if (entity['@Communication.Contact.n.additional'])
                response += `${entity['@Communication.Contact.n.additional']['=']} || ' ' ||`;

              response += `${entity['@Communication.Contact.n.surname']['=']}`;
              if (entity['@Communication.Contact.n.suffix'])
                response += `|| ' ' || ${entity['@Communication.Contact.n.suffix']['=']}`;
              return response;
            }
            return null;
          },
          get email() {
            if (entity['@Communication.Contact.email']) {
              const preferredEmail = entity['@Communication.Contact.email'].find(
                (email) => email.type && email.type['#'] === 'preferred',
              );
              const homeEmail = entity['@Communication.Contact.email'].find(
                (email) => email.type && email.type['#'] === 'home',
              );
              if (preferredEmail) {
                return preferredEmail.address['='];
              } else if (homeEmail) {
                return homeEmail.address['='];
              } else {
                return entity['@Communication.Contact.email'][0].address['='];
              }
            }
            return null;
          },
        };
      },
    };
  },
});
