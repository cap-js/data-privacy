const cds = require('@sap/cds');
const LOG = cds._dpi.log('data-privacy');
const { _getBlockingDateField, _getEndOfRetentionField } = require('../utils');
const enhanceAnnotations = require('./shared/enhanceAnnotations');
const { entityValidation } = require('./shared/modelValidations');
const exposeInformationEntity = require('./information/exposeEntity');
const exposeRetentionEntity = require('./retention/exposeEntity');
const {
  getLowestILMObjectInProjectionHierarchy,
  exposeAutoExposedEntities,
  fixRelationTarget,
} = require('./shared/entityExposure');

const RETENTION_SERVICE = 'sap.ilm.RetentionService';
const INFORMATION_SERVICE = 'sap.dpp.InformationService';

/**
 * Generates the DPI Information and Retention services
 * @param {CSN} m
 * @returns
 */
module.exports = function enhanceModel(m) {
  const _enhanced = 'sap.ilm.enhanced';
  if (m.meta?.[_enhanced] || m.definitions[INFORMATION_SERVICE]?.['@sap.ilm.model.enhanced']) {
    return; // already enhanced
  }

  const inferredCSN =
    m.meta.flavor === 'xtended'
      ? cds.compile({
          'csn.csn': JSON.stringify(m),
        })
      : m;

  enhanceAnnotations(m, inferredCSN);

  const DPI_SERVICES = { [RETENTION_SERVICE]: {}, [INFORMATION_SERVICE]: {} };

  for (const DPI_SRV in DPI_SERVICES) {
    LOG.debug(`Existing ${DPI_SRV}: `, inferredCSN.definitions[DPI_SRV]);
  }
  for (const artefactName in inferredCSN.definitions) {
    if (inferredCSN.definitions[artefactName].kind !== 'entity') {
      continue;
    }

    const baseILMEntityName = getLowestILMObjectInProjectionHierarchy(artefactName, inferredCSN);
    const baseILMEntity = inferredCSN.definitions[baseILMEntityName];
    const isAlreadyExposed = Object.keys(DPI_SERVICES).some(
      (DPI_SRV) => baseILMEntityName in DPI_SERVICES[DPI_SRV] || artefactName.startsWith(DPI_SRV),
    );

    // Validation at the start to also cover incomplete entities
    entityValidation(artefactName, inferredCSN, DPI_SERVICES);

    // REVISIT: Once archiving is supported this needs to check against ILM namespace as well
    if (!baseILMEntity['@PersonalData.EntitySemantics']) {
      continue;
    }

    // Ensure Blocking and EndOfRetention date fields are exposed in every projection
    if (
      Object.keys(DPI_SERVICES).some(
        (DPI_SRV) =>
          baseILMEntityName in DPI_SERVICES[DPI_SRV] || baseILMEntityName.startsWith(DPI_SRV),
      )
    ) {
      const entity = inferredCSN.definitions[artefactName];
      if (
        _getBlockingDateField(baseILMEntity.elements) &&
        !_getBlockingDateField(entity.elements)
      ) {
        entity.elements[
          _getBlockingDateField(inferredCSN.definitions['sap.ilm.blocking'].elements)
        ] =
          inferredCSN.definitions['sap.ilm.blocking'].elements[
            _getBlockingDateField(inferredCSN.definitions['sap.ilm.blocking'].elements)
          ];
        const query = entity.query?.SELECT ?? entity.projection;
        if (query) {
          const queryTarget = inferredCSN.definitions[query.from?.ref[0]];
          query.columns ??= ['*'];
          if (
            !query.columns.includes('*') &&
            !query.columns.some(
              (c) => c.ref && c.ref[0] === _getBlockingDateField(queryTarget.elements),
            )
          ) {
            query.columns.push({ ref: [_getBlockingDateField(baseILMEntity.elements)] });
          }
        }
      }
      if (
        _getEndOfRetentionField(baseILMEntity.elements) &&
        !_getEndOfRetentionField(entity.elements)
      ) {
        entity.elements[
          _getEndOfRetentionField(inferredCSN.definitions['sap.ilm.destruction'].elements)
        ] =
          inferredCSN.definitions['sap.ilm.destruction'].elements[
            _getEndOfRetentionField(inferredCSN.definitions['sap.ilm.destruction'].elements)
          ];
        const query = entity.query?.SELECT ?? entity.projection;
        if (query) {
          const queryTarget = inferredCSN.definitions[query.from?.ref[0]];
          query.columns ??= ['*'];
          if (
            !query.columns.includes('*') &&
            !query.columns.some(
              (c) => c.ref && c.ref[0] === _getEndOfRetentionField(queryTarget.elements),
            )
          ) {
            query.columns.push({
              ref: [_getEndOfRetentionField(baseILMEntity.elements)],
            });
          }
        }
      }
      continue;
    }

    // Skip data subject details entity if it is a composition of data subject as the data subject itself will include it
    if (
      baseILMEntity['@PersonalData.EntitySemantics'] === 'DataSubjectDetails' &&
      Object.values(baseILMEntity.elements).some(
        (e) =>
          e.target &&
          inferredCSN.definitions[e.target]['@PersonalData.EntitySemantics'] === 'DataSubject' &&
          Object.values(inferredCSN.definitions[e.target].elements).some(
            (ee) => ee.target && ee.target === artefactName,
          ),
      )
    ) {
      continue;
    }

    exposeInformationEntity(
      isAlreadyExposed ? baseILMEntityName : artefactName,
      baseILMEntity,
      DPI_SERVICES[INFORMATION_SERVICE],
      inferredCSN,
    );
    exposeRetentionEntity(
      isAlreadyExposed ? baseILMEntityName : artefactName,
      baseILMEntity,
      DPI_SERVICES[RETENTION_SERVICE],
      inferredCSN,
    );
  }

  // expose Auto exposed entities manually to avoid wrong service exposures
  for (let artefactName in inferredCSN.definitions) {
    let artefact = inferredCSN.definitions[artefactName];
    if (artefactName.startsWith(RETENTION_SERVICE)) {
      exposeAutoExposedEntities(
        artefact,
        RETENTION_SERVICE,
        DPI_SERVICES[RETENTION_SERVICE],
        inferredCSN,
        {
          exposeEntities: false,
        },
      );
    } else if (artefactName.startsWith(INFORMATION_SERVICE)) {
      exposeAutoExposedEntities(
        artefact,
        INFORMATION_SERVICE,
        DPI_SERVICES[INFORMATION_SERVICE],
        inferredCSN,
      );
    }
  }

  // Because entities are manually added compositions and associations have to be cleaned up so targets match the service
  for (let artefactName in inferredCSN.definitions) {
    let artefact = inferredCSN.definitions[artefactName];
    for (const DPI_SRV in DPI_SERVICES) {
      if (artefactName.startsWith(DPI_SRV)) {
        fixRelationTarget(artefact, DPI_SERVICES[DPI_SRV], DPI_SRV, inferredCSN);
        break;
      }
    }
  }

  if (LOG.DEBUG) {
    for (const DPI_SRV in DPI_SERVICES) {
      LOG.debug(
        `${DPI_SRV} model after modification by DPI plugin: `,
        Object.keys(inferredCSN.definitions)
          .filter((k) => k === DPI_SRV)
          .reduce((acc, key) => {
            acc[key] = inferredCSN.definitions[key];
            return acc;
          }, {}),
      );
    }
  }

  // Copy all DPI service artifacts from inferredCSN to model
  for (const artefactName of Object.keys(inferredCSN.definitions).filter((name) =>
    Object.keys(DPI_SERVICES).some((dpi_srv) => name.startsWith(dpi_srv)),
  )) {
    let artefact = inferredCSN.definitions[artefactName];
    m.definitions[artefactName] = artefact;
  }

  // REVISIT: Setting var on service is a workaround because CSN meta is not passed along compiles
  m.definitions[INFORMATION_SERVICE]['@sap.ilm.model.enhanced'] = true;

  m.meta ??= {};
  m.meta[_enhanced] = true;
  return m;
};
