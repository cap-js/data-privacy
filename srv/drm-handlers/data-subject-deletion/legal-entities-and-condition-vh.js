const cds = require('@sap/cds'), dayjs = require('dayjs'), LOG = cds.log('drm')
const { _getLegalEntity } = require('../../utils')

function serveLegalEntitiesAndVHs(srv, db) {
    const { legalEntities } = srv.entities

    srv.on('READ', legalEntities, async req => {
        const {dataSubjectRole} = req.data
        if (!dataSubjectRole) {
            const legalEntities = []

            for (const entityName in srv.entities) {
                const entity = srv.entities[entityName]
                const element = _getLegalEntity(entity.elements)
                if (element) {
                    const legalEntity = entity.elements[element]._target
                    const valueColumn = entity.elements[element]._target['@UI.HeaderInfo.Title.Value']['=']
                    const descriptionColumn = entity.elements[element]._target['@UI.HeaderInfo.Title.Value']['=']
                    legalEntities.push(...(await SELECT.from(legalEntity).columns(`${valueColumn} as value`, `${descriptionColumn} as valueDesc`)))
                }
            }
            return legalEntities.reduce((acc, val) => {
                if (!acc.some(a => a.value === val.value))
                    acc.push(val)
                return acc
            }, [])
        }
        //Check all entities where one field is annotated with legalEntityID
        //Check if entity itself is data Subject and matches the role
        //Or if navigation is possible -> Keep in mind mnanaged and unmanaged associations

        for (const entityName in srv.entities) {
            const entity = srv.entities[entityName]
            const element = _getLegalEntity(entity.elements)
            if (element && entity['@PersonalData.DataSubjectRole'] === dataSubjectRole) {
                const legalEntity = entity.elements[element]._target
                const valueColumn = entity.elements[element]._target['@UI.HeaderInfo.Title.Value']['=']
                const descriptionColumn = entity.elements[element]._target['@UI.HeaderInfo.Title.Value']['=']
                return await SELECT.from(legalEntity).columns(`${valueColumn} as value`, `${descriptionColumn} as valueDesc`)
            }
        }
    })
}


module.exports = serveLegalEntitiesAndVHs