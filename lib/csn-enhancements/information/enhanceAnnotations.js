const cds = require("@sap/cds");
const LOG = cds._dpi.log("data-privacy");

/**
 * Some OData annotations mean the same thing. To avoid situations, where devs have to annotate the entity multiple times for the same meaning,
 * the annotation helper ensures, that all kinds of a meaning are covered
 * @param {*} m
 * @param {*} inferredCSN - model but always inferred
 */
module.exports = function annotationHelper(m, inferredCSN) {
  const isPersonal = (element) => (element["@PersonalData.IsPotentiallyPersonal"] = true);
  const isSensitive = (element) => (element["@PersonalData.IsPotentiallySensitive"] = true);
  const annotationIsPersonal = (def, annotation, altForWrite) => {
    altForWrite = altForWrite || def;
    if (def[annotation] && altForWrite.elements && altForWrite.elements[def[annotation]["="]]) {
      isPersonal(altForWrite.elements[def[annotation]["="]]);
    }
  };
  const annotationIsSensitive = (def, annotation, altForWrite) => {
    altForWrite = altForWrite || def;
    if (def[annotation] && altForWrite.elements[def[annotation]["="]]) {
      isSensitive(altForWrite.elements[def[annotation]["="]]);
    }
  };
  const nameProperties = {
      surname: 1,
      given: 1,
      additional: 1,
      prefix: 1,
      suffix: 1
    },
    addressProperties = {
      building: 1,
      street: 1,
      district: 1,
      locality: 1,
      region: 1,
      code: 1,
      country: 1,
      pobox: 1,
      ext: 1,
      careof: 1
    };
  for (let each in inferredCSN.definitions) {
    const inferredDef = inferredCSN.definitions[each];
    const def = m.definitions[each];
    if (!def) {
      LOG.debug(
        `Skipping ${each} for enhanceAnnotations because it does not exist in the base model. This is for example the case for .texts or .drafts entities`
      );
      continue;
    }
    for (let ele in inferredDef.elements) {
      const inferredEleDef = inferredDef.elements[ele];
      const eleDef = def.elements?.[ele];
      if (eleDef && inferredEleDef["@Communication.IsEmailAddress"]) {
        isPersonal(eleDef);
      } else if (eleDef && inferredEleDef["@Communication.IsPhoneNumber"]) {
        isPersonal(eleDef);
      }
    }
    for (const name in nameProperties) {
      annotationIsPersonal(inferredDef, `@Communication.Contact.n.${name}`, def);
    }
    annotationIsPersonal(inferredDef, "@Communication.Contact.nickname", def);
    annotationIsSensitive(inferredDef, "@Communication.Contact.bday", def);
    annotationIsSensitive(inferredDef, "@Communication.Contact.anniversary", def);
    annotationIsSensitive(inferredDef, "@Communication.Contact.gender", def);
    annotationIsSensitive(inferredDef, "@Communication.Contact.photo", def);
    annotationIsPersonal(inferredDef, "@Communication.Contact.title", def);
    if (inferredDef["@Communication.Contact.adr"]) {
      for (const adr of inferredDef["@Communication.Contact.adr"]) {
        for (const a in addressProperties) {
          annotationIsPersonal(adr, a, def);
        }
      }
    }
    if (inferredDef["@Communication.Contact.tel"]) {
      for (const tel of inferredDef["@Communication.Contact.tel"]) {
        annotationIsPersonal(tel, `uri`, def);
        if (tel.uri["="]) {
          def.elements[tel.uri["="]]["@Communication.IsPhoneNumber"] = true;
        }
      }
    }
    if (inferredDef["@Communication.Contact.email"]) {
      for (const email of inferredDef["@Communication.Contact.email"]) {
        annotationIsPersonal(email, `address`, def);
        if (email.address["="] && def.elements && inferredDef.elements[email.address["="]]) {
          def.elements[email.address["="]]["@Communication.IsEmailAddress"] = true;
        }
      }
    }
    if (inferredDef["@Communication.Address"]) {
      for (const adr of inferredDef["@Communication.Address"]) {
        for (const a in addressProperties) {
          annotationIsPersonal(adr, a, def);
        }
      }
    }

    if (Object.keys(inferredDef).filter((k) => k.startsWith("@ILM.BlockingEnabled")).length > 0) {
      const blockingAnnotations = Object.keys(inferredDef).filter((k) =>
        k.startsWith("@ILM.BlockingEnabled")
      );
      for (const blockingAnnotation of blockingAnnotations) {
        if (blockingAnnotation === "@ILM.BlockingEnabled.$edmJson.$Path") {
          const segments = inferredDef[blockingAnnotation].split("/");
          let service = null;
          if (segments[0] === "") {
            segments.shift();
          }
          if (segments[0].endsWith("EntityContainer")) {
            service = segments.shift();
            service = service.substring(0, service.length - 16);
          } else {
            const nameSegments = each.split(".");
            let cumulatedSegments = "";
            for (const segment of nameSegments) {
              cumulatedSegments += segment;
              if (
                inferredCSN.definitions[cumulatedSegments]?.type === "service" &&
                inferredCSN.definitions[cumulatedSegments + "." + segments[0]]
              ) {
                service = cumulatedSegments;
                //Don't break because there could be a service with more parts of the identifier
              }
            }
          }
          const singletonTarget = inferredCSN.definitions[service + "." + segments[0]];
          if (!singletonTarget) {
            LOG.error(
              `${each} is annotated with @ILM.BlockingEnabled, however the entity path given cannot be found! You can either write @ILM.IsBlockingEnabled: {$edmJson: {$Path: '<Service name>.EntityContainer/<singleton entity>/<property>'}} or @ILM.IsBlockingEnabled: 'SELECT <property> FROM <singleton>'`
            );
            continue;
          }
          if (!singletonTarget["@odata.singleton"]) {
            LOG.error(
              `${each} is annotated with @ILM.BlockingEnabled, however the dynamic target path points to ${service + "." + segments[0]} which is not annotated with @odata.singleton!`
            );
            continue;
          }
          const targetedProperty = singletonTarget.elements[segments[1]];
          if (!targetedProperty) {
            LOG.error(
              `${each} is annotated with @ILM.BlockingEnabled, however the dynamic target path points to '${segments[1]}' on ${service + "." + segments[0]} and '${segments[1]}' is not a property on the singleton!`
            );
            continue;
          }
          delete def[blockingAnnotation];
          def["@ILM.BlockingEnabled"] = {
            xpr: [SELECT.one.from(service + "." + segments[0]).columns(segments[1])],
            _service: service
          };
          break;
        } else if (
          blockingAnnotation === "@ILM.BlockingEnabled" &&
          typeof inferredDef[blockingAnnotation] === "string"
        ) {
          try {
            const xpr = cds.parse.expr(inferredDef[blockingAnnotation]);
            if (!xpr.SELECT) {
              LOG.error(
                `${each} is annotated with @ILM.BlockingEnabled, however the expression cannot be used. The expression must follow the pattern: @ILM.IsBlockingEnabled: 'SELECT <property> FROM <singleton>'`
              );
              continue;
            }
            def["@ILM.BlockingEnabled"] = { xpr: [xpr] };
          } catch (error) {
            LOG.error(
              `${each} is annotated with @ILM.BlockingEnabled, however the annotation value could not be parsed as an expression! Parsing error: ${error}`
            );
            continue;
          }
        } else if (blockingAnnotation.startsWith("@ILM.BlockingEnabled.$edmJson")) {
          LOG.error(
            `${each} is annotated with @ILM.BlockingEnabled, however the path is invalid! You can either write @ILM.IsBlockingEnabled: {$edmJson: {$Path: '<Service name>.EntityContainer/<singleton entity>/<property>'}} or @ILM.IsBlockingEnabled: 'SELECT <property> FROM <singleton>'`
          );
          continue;
        }
      }
    }
  }
};
