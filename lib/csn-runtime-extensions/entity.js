const cds = require('@sap/cds');

Object.defineProperty(cds.builtin.classes.entity.prototype, '_dpi', {
  get() {
    return {
      get isILMObject() {
        return this['@PersonalData.EntitySemantics'] === 'Other';
      },
      get endOfBusinessReference() {
        for (const element in this.elements) {
          if (this.elements[element] && this.elements[element]['@PersonalData.FieldSemantics'] === 'EndOfBusinessDate' && !this.elements[element].isAssociation) {
            return element;
          }
        }
        return null;
      },
      get dataSubjectIdReference() {
        for (const element in this.elements) {
          if (this.elements[element] && this.elements[element]['@PersonalData.FieldSemantics'] === 'DataSubjectID' && !this.elements[element].isAssociation) {
            return element;
          }
        }
        return null;
      },
      get orgAttributeReference() {
        for (const element in this.elements) {
          if (this.elements[element] && (this.elements[element]['@PersonalData.FieldSemantics'] === 'DataControllerID' || this.elements[element]['@ILM.FieldSemantics'] === 'LineOrganizationAttribute') && !this.elements[element].isAssociation) {
            return element;
          }
        }
        return null;
      },
      get dataSubject() {
        if (!this['@PersonalData.EntitySemantics'] === 'DataSubjectDetails' && !this['@PersonalData.EntitySemantics'] === 'DataSubject') {
          return null;
        }
        return {
          get name() {
            if (this['@Communication.Contact.fn']) {
              return this['@Communication.Contact.fn']['=']
            } else if (this['@Communication.Contact.n.surname']) {
              let response = ''
              if (this['@Communication.Contact.n.prefix'])
                response += `${this['@Communication.Contact.n.prefix']['=']} || ' ' ||`
              if (this['@Communication.Contact.n.given'])
                response += `${this['@Communication.Contact.n.given']['=']} || ' ' ||`
              if (this['@Communication.Contact.n.additional'])
                response += `${this['@Communication.Contact.n.additional']['=']} || ' ' ||`

              response += `${this['@Communication.Contact.n.surname']['=']}`
              if (this['@Communication.Contact.n.suffix'])
                response += `|| ' ' || ${this['@Communication.Contact.n.suffix']['=']}`
              return response;
            }
            return null;
          },
          get email() {
            if (this['@Communication.Contact.email']) {
              const preferredEmail = this['@Communication.Contact.email'].find(email => email.type && email.type['#'] === 'preferred')
              const homeEmail = this['@Communication.Contact.email'].find(email => email.type && email.type['#'] === 'home')
              if (preferredEmail) {
                return preferredEmail.address['=']
              } else if (homeEmail) {
                return homeEmail.address['=']
              } else {
                return this['@Communication.Contact.email'][0].address['=']
              }
            }
            return null;
          }
        }
      }
    }
  },
});