const { _getDataSubjectIDField } = require('../../utils');
const { exposeCompositionsWithRewrites } = require('../shared/compositionsRewrite');
const { defineILMRootColumns } = require('../shared/entityExposure');
const { assignInformationAnnotations } = require('./enhanceAnnotations');

//add all composition entities to SAP DPI Information too
//if composition entity has backlink use that to also show parent keys & semantic keys -
//in case of parent key is ID - prefix label with parent name
//If composition entity has no backlink than create projection out of service just to get backlink

module.exports = function exposeInformationEntity(name, def, exposedEntities, m) {
  const entityName = name.split('.')[name.split('.').length - 1];

  //Add DataSubjectID field from parent - from root view also have a look at comps to one and resolve if those contain the fields
  const fields = {
    dsID: _getDataSubjectIDField(def.elements) || _getDataSubjectIDField,
  };
  const entityAlreadyExposed = !!m.definitions['sap.ilm.InformationService' + '.' + entityName];
  const informationEntity =
    m.definitions['sap.ilm.InformationService' + '.' + entityName] ?? structuredClone(def);
  if (!entityAlreadyExposed) {
    if (informationEntity.includes) delete informationEntity.includes;
    informationEntity.query = {
      SELECT: {
        from: { ref: [name] },
        columns: defineILMRootColumns(informationEntity, fields, m),
      },
    };
    Object.assign(informationEntity, assignInformationAnnotations(def, fields));
    m.definitions['sap.ilm.InformationService' + '.' + entityName] = informationEntity;
  }
  exposedEntities[name] = 'sap.ilm.InformationService' + '.' + entityName;

  //This adds the compositions for DPIInformation
  const composedEntities = exposeCompositionsWithRewrites(name, informationEntity, m, {
    dsFields: fields,
    redirectForParent: undefined,
    entities: exposedEntities,
    dppServiceName: 'sap.ilm.InformationService',
    assignInformationAnnotations: true,
    rmCompsToTransactionalRecords: true,
  });
  Object.assign(m.definitions, composedEntities);

  //REVISIT: Check with containment if compositions are correctly exposed, likely composition entities need to be removed from model after they have been rewritten
};
