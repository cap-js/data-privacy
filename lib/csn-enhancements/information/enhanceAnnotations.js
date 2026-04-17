const cds = require("@sap/cds");
const { _getDataSubjectIDField } = require("../../utils");
const LOG = cds._dpi.log("data-privacy");

const managedFields = {
  createdBy: 1,
  createdAt: 1,
  modifiedBy: 1,
  modifiedAt: 1
};

function assignInformationAnnotations(entity, excludingFields = []) {
  let result = {
    "@readonly": true, //Ensure that DPI Info entities are marked as readonly
    "@PersonalData.DataSubjectRole": entity["@PersonalData.DataSubjectRole"],
    "@PersonalData.EntitySemantics": entity["@PersonalData.EntitySemantics"]
  };

  if (!entity["@UI.LineItem"]) {
    result["@UI.LineItem"] = getFields(
      entity,
      excludingFields.concat(_getDataSubjectIDField(entity.elements))
    );
  }

  if (!Object.keys(entity).some((k) => k.startsWith("@UI.FieldGroup"))) {
    result["@UI.FieldGroup#CAP_DPI_GENERATED.Label"] =
      entity["@Core.Description"] ||
      entity["@description"] ||
      (entity["@PersonalData.EntitySemantics"] === "DataSubjectDetails"
        ? "{i18n>INFORMATION_DATA_SUBJECT_DETAILS}"
        : "{i18n>INFORMATION_DETAILS}");
    result["@UI.FieldGroup#CAP_DPI_GENERATED.Data"] =
      entity["@UI.LineItem"] ?? getFields(entity, excludingFields);
  }

  return result;
}

function getFields(entity, excludingFields) {
  //Show key first
  //Than semantic keys
  //Than all other fields. But exclude data subject ID from LineItem as this is redundant info
  const hasManaged = entity.includes && entity.includes.some((i) => i === "managed");
  const semanticKeys = entity["@Common.SemanticKey"]
    ? entity["@Common.SemanticKey"].map((m) => m["="])
    : [];
  const asLineItem = (field) => ({ Value: { "=": field } });
  const lineItemElementMapping = ([field, element]) => {
    if (element.keys?.length) {
      //REVISIT: Arbitrary limitation that only first key values are taken over
      return asLineItem(field + "_" + element.keys[0].ref.join("_"));
    } else if (element.keys?.length === 0) {
      LOG.error(
        `${element.target} does not have any keys! Please add a primary key, which is needed for the data-privacy plugin!`
      );
      return asLineItem(field);
    } else {
      return asLineItem(field);
    }
  };
  //Only fields which are not yet added and possible (e.g. exclude associations/compositions without foreign key or which are to many) + sort after which contain personal data
  const otherFields = Object.entries(entity.elements)
    .filter(
      ([n, e]) =>
        !e.key &&
        (!(e.type === "cds.Association" || e.type === "cds.Composition" || (!e.keys && e.on)) ||
          e.keys) &&
        !excludingFields.some((f) => f === n) &&
        !semanticKeys.some((s) => s === n)
    )
    .sort(([, e1], [, e2]) => {
      if (
        (e1["@PersonalData.IsPotentiallySensitive"] &&
          !e2["@PersonalData.IsPotentiallySensitive"]) ||
        (e1["@PersonalData.IsPotentiallyPersonal"] &&
          !e2["@PersonalData.IsPotentiallySensitive"] &&
          !e2["@PersonalData.IsPotentiallyPersonal"])
      )
        return -1;
      if (
        (e2["@PersonalData.IsPotentiallySensitive"] &&
          !e1["@PersonalData.IsPotentiallySensitive"]) ||
        (e2["@PersonalData.IsPotentiallyPersonal"] &&
          !e1["@PersonalData.IsPotentiallySensitive"] &&
          !e1["@PersonalData.IsPotentiallyPersonal"])
      )
        return 1;
      return 0;
    });
  //Ensure that in other fields managed fields are at the end
  if (hasManaged) {
    for (const m in managedFields) {
      const index = otherFields.indexOf(otherFields.find(([n]) => n === m));
      if (index >= 0) {
        otherFields.push(...otherFields.splice(index, 1));
      }
    }
  }

  return [
    ...Object.entries(entity.elements)
      .filter(([, e]) => e.key)
      .map(lineItemElementMapping),
    ...semanticKeys.map((m) => asLineItem(m)),
    ...otherFields.map(lineItemElementMapping)
  ];
}

module.exports = {
  assignInformationAnnotations
};
