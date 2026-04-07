const cds = require("@sap/cds");
const { getTranslationKey } = require("../utils");

cds.extend(cds.entity).with(
  class {
    get _dpi() {
      const entity = this;
      if (entity._$dpi) return entity._$dpi;
      entity._$dpi = {
        get endOfBusinessReference() {
          delete this.endOfBusinessReference;
          this.endOfBusinessReference = null;
          for (const element in entity.elements) {
            if (
              entity.elements[element] &&
              entity.elements[element]["@PersonalData.FieldSemantics"] === "EndOfBusinessDate" &&
              !entity.elements[element].isAssociation
            ) {
              this.endOfBusinessReference = element;
              break;
            }
          }
          return this.endOfBusinessReference;
        },
        get blockingDateReference() {
          delete this.blockingDateReference;
          this.blockingDateReference = null;
          for (const element in entity.elements) {
            if (
              entity.elements[element] &&
              entity.elements[element]["@PersonalData.FieldSemantics"] === "BlockingDate" &&
              !entity.elements[element].isAssociation
            ) {
              this.blockingDateReference = element;
              break;
            }
          }
          return this.blockingDateReference;
        },
        get earliestDestructionDateReference() {
          delete this.earliestDestructionDateReference;
          this.earliestDestructionDateReference = null;
          for (const element in entity.elements) {
            if (
              entity.elements[element] &&
              entity.elements[element]["@PersonalData.FieldSemantics"] === "EndOfRetentionDate" &&
              !entity.elements[element].isAssociation
            ) {
              this.earliestDestructionDateReference = element;
              break;
            }
          }
          return this.earliestDestructionDateReference;
        },
        get dataSubjectIdReference() {
          delete this.dataSubjectIdReference;
          this.dataSubjectIdReference = null;
          for (const element in entity.elements) {
            if (
              entity.elements[element] &&
              entity.elements[element]["@PersonalData.FieldSemantics"] === "DataSubjectID" &&
              !entity.elements[element].isAssociation
            ) {
              this.dataSubjectIdReference = element;
              break;
            }
          }
          return this.dataSubjectIdReference;
        },

        /**
         * Checks for the element where the vhId matches the @ILM.ValueHelp.Id annotation.
         *
         * @returns element name
         */
        elementByVHId(vhId) {
          for (const element in entity.elements) {
            if (
              entity.elements[element]["@ILM.ValueHelp.Id"] === vhId &&
              !entity.elements[element].isAssociation
            ) {
              return element;
            }
          }
          return null;
        },

        get orgAttributeReference() {
          delete this.orgAttributeReference;
          this.orgAttributeReference = null;
          for (const element in entity.elements) {
            if (
              entity.elements[element] &&
              (entity.elements[element]["@PersonalData.FieldSemantics"] === "DataControllerID" ||
                entity.elements[element]["@ILM.FieldSemantics"] === "LineOrganizationID") &&
              !entity.elements[element].isAssociation
            ) {
              this.orgAttributeReference = element;
              break;
            }
          }
          return this.orgAttributeReference;
        },

        get iLMObject() {
          delete this.iLMObject;
          if (entity["@PersonalData.EntitySemantics"] !== "Other") {
            this.iLMObject = null;
            return this.iLMObject;
          }
          this.iLMObject = {
            get endOfBusinessDates() {
              delete this.endOfBusinessDates;
              this.endOfBusinessDates = Object.entries(entity.elements).reduce(
                (acc, [name, value]) => {
                  if (
                    value["@PersonalData.FieldSemantics"] === "EndOfBusinessDate" &&
                    value.type !== "cds.Association" &&
                    value.type !== "cds.Composition"
                  ) {
                    const startTime = {
                      referenceDateName: name,
                      referenceDateDescription:
                        cds.i18n.labels.for(value) ?? cds.i18n.labels.key4(value),
                      referenceDateDescriptionKey: undefined
                    };
                    const descriptionI18nKey = getTranslationKey(value["@Common.Label"]);
                    if (descriptionI18nKey) {
                      startTime.referenceDateDescriptionKey = descriptionI18nKey;
                    }
                    acc.push(startTime);
                  }
                  return acc;
                },
                []
              );
              return this.endOfBusinessDates;
            }
          };
          return this.iLMObject;
        },

        get dataSubject() {
          delete this.dataSubject;
          if (
            entity["@PersonalData.EntitySemantics"] !== "DataSubjectDetails" &&
            entity["@PersonalData.EntitySemantics"] !== "DataSubject"
          ) {
            this.dataSubject = null;
            return this.dataSubject;
          }
          this.dataSubject = {
            get name() {
              delete this.name;
              this.name = null;
              if (entity["@Communication.Contact.fn"]) {
                this.name = entity["@Communication.Contact.fn"]["="];
              } else if (entity["@Communication.Contact.n.surname"]) {
                let response = "";
                if (entity["@Communication.Contact.n.prefix"])
                  response += `${entity["@Communication.Contact.n.prefix"]["="]} || ' ' ||`;
                if (entity["@Communication.Contact.n.given"])
                  response += `${entity["@Communication.Contact.n.given"]["="]} || ' ' ||`;
                if (entity["@Communication.Contact.n.additional"])
                  response += `${entity["@Communication.Contact.n.additional"]["="]} || ' ' ||`;

                response += `${entity["@Communication.Contact.n.surname"]["="]}`;
                if (entity["@Communication.Contact.n.suffix"])
                  response += `|| ' ' || ${entity["@Communication.Contact.n.suffix"]["="]}`;
                this.name = response;
              }
              return this.name;
            },
            get email() {
              delete this.email;
              this.email = null;
              if (entity["@Communication.Contact.email"]) {
                const preferredEmail = entity["@Communication.Contact.email"].find(
                  (email) => email.type && email.type["#"] === "preferred"
                );
                const homeEmail = entity["@Communication.Contact.email"].find(
                  (email) => email.type && email.type["#"] === "home"
                );
                if (preferredEmail) {
                  this.email = preferredEmail.address["="];
                } else if (homeEmail) {
                  this.email = homeEmail.address["="];
                } else {
                  this.email = entity["@Communication.Contact.email"][0].address["="];
                }
              }
              return this.email;
            }
          };
          return this.dataSubject;
        }
      };
      return entity._$dpi;
    }
  }
);
