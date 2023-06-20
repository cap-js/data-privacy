const cds = require('@sap/cds')

const whereForSelectionCriteria = (criteria) => {
    let where = []
    criteria.forEach((e, idx) => {
        if (idx !== 0) where.push('and')
        where.push(
            {ref: [e.name]}
        )
        if (e.value) {
            where.push(
                '=',
                {val: e.value}
            ) 
        } else {
            where.push(
                'between',
                {val: e.valueRange.from},
                'and',
                {val: e.valueRange.to}
            )
        }
    })
    return where
}

const whereForConditionSet = (conditions) => {
    let where = []
    conditions.forEach((e, idx) => {
        if (idx !== 0) where.push('and')
        where.push(
            {ref: [e.conditionFieldName]},
            '=',
            {val: e.conditionFieldValue}
        )
    })
    return where
}

const _getDataSubjectEmailField = (entity) => {
    if (entity['@Communication.Contact.email']) {
        const preferredEmail = entity['@Communication.Contact.email'].find(email => email.type && email.type['#'] === 'preferred')
        const homeEmail = entity['@Communication.Contact.email'].find(email => email.type && email.type['#'] === 'home')
        if (preferredEmail) return preferredEmail.address['=']
        else if (homeEmail) return homeEmail.address['=']
        else return entity['@Communication.Contact.email'][0].address['=']
    }
    return '"No Email specified"' //Fallback string
}

const _getDataSubjectNameField = (entity) => {
    if (entity['@Communication.Contact.fn'])
        return entity['@Communication.Contact.fn']['=']
    else if (entity['@Communication.Contact.n.surname']) {
        let response = ''
        if (entity['@Communication.Contact.n.prefix'])
            response += `${entity['@Communication.Contact.n.prefix']['=']} || ' ' ||`
        if (entity['@Communication.Contact.n.given'])
            response += `${entity['@Communication.Contact.n.given']['=']} || ' ' ||`
        if (entity['@Communication.Contact.n.additional'])
            response += `${entity['@Communication.Contact.n.additional']['=']} || ' ' ||`

        response += `${entity['@Communication.Contact.n.surname']['=']}`
        if (entity['@Communication.Contact.n.suffix'])
            response += `|| ' ' || ${entity['@Communication.Contact.n.suffix']['=']}`
        return response
    }
    return '"No name specified"' //Fallback string
}

const _getDataSubjectIDField = (elements) => _getField(elements, 'DataSubjectID')
const _getLegalEntityIDField = (elements) => _getField(elements, 'LegalEntityID')
const _getEndOfBusinessDateField = (elements) => _getField(elements, 'EndOfBusinessDate')

const _getLegalEntity = (elements) => {
    for (const element in elements) {
        if (elements[element] && elements[element]['@PersonalData.FieldSemantics'] === 'LegalEntityID' && elements[element].isAssociation)
            return element
    }
}

const _getField = (elements, name) => {
    for (const element in elements) {
        if (elements[element] && elements[element]['@PersonalData.FieldSemantics'] === name && !elements[element].isAssociation)
            return element
    }
}

const _buildWhereClauseForDS = (entity, dsID) => {
    const dataSubjectIDField = _getDataSubjectIDField(entity.elements)
    const where = [
        {ref: [dataSubjectIDField]},
        '=',
        {val: dsID}
    ]
    return where
}

const _buildWhereClauseForDSs = (entity, dsIDs) => {
    const dataSubjectIDField = _getDataSubjectIDField(entity.elements)
    const where = {}
    where[dataSubjectIDField] = {in: dsIDs}
    return where
}

const _getDataSubjectEntities = (dsRole, srv) => {
    const entities = []
    for (const entityName in srv.entities) {
        const entity = srv.entities[entityName]
        if (entity && entity['@PersonalData.DataSubjectRole'] === dsRole && (entity['@PersonalData.EntitySemantics'] === 'DataSubjectDetails' || entity['@PersonalData.EntitySemantics'] === 'DataSubject')) {
            entities.push(entity)
        }
    }
    return entities
}

const _getLegalGroundEntitiesForDS = (dsRole, srv) => {
    const entities = []
    for (const entityName in srv.entities) {
        const entity = srv.entities[entityName]
        if (entity && entity['@PersonalData.DataSubjectRole'] === dsRole && entity['@PersonalData.EntitySemantics'] === 'Other') {
            entities.push(entity)
        }
    }
    return entities
}

const _getEntitiesForRole = (dsRole, srv) => {
    const entities = []
    for (const entityName in srv.entities) {
        const entity = srv.entities[entityName]
        if (entity && entity['@PersonalData.DataSubjectRole'] === dsRole) {
            entities.push(entity)
        }
    }
    return entities
}

const _getDataSubjectEntityByRole = (dsRole, srv) => {
    for (const entityName in srv.entities) {
        const entity = srv.entities[entityName]
        if (entity && entity['@PersonalData.DataSubjectRole'] === dsRole && entity['@PersonalData.EntitySemantics'] === 'DataSubject') {
            return entity
        }
    }
    return null
}

const _getEntityForLegalGround = (legalGround, srv) => {
    const names = legalGround.split('.')
    const name = names[names.length-1]
    return srv.entities[name]
}

const _getWholeObjectTree = (entity) => {
    const where = []
    where.push({ref: ['*']})
    if (entity.compositions) {
        for (const [name, composition] of Object.entries(entity.compositions)) {
            where.push({ref: [name], expand: _getWholeObjectTree(composition._target)})
        }
    }
    return where
} 

const _getRoot = (entity) =>  {
    if (!entity.query)
      return entity
    else 
      return _getRoot(entity.query._target)
}

const _nullForeignKeysOnLegalGround = (entity, whereClause) => {
    const nullForeignKeysUpdateQueries = []
    if (!cds.db) return []
    entity = _getRoot(entity)
    for (const definition in cds.db.model.definitions) {
        if (definition.kind === 'entity' && !definition.query && definition.associations 
            && Object.values(definition.associations).some(val => val.target === entity.name)
        ) {
            for (const assoc in definition.associations) {
                if (assoc.target === entity.name) {
                    nullForeignKeysUpdateQueries.push(
                        UPDATE.entity(definition).where([
                            'exists',
                            {
                                ref: [
                                {
                                    id: assoc.name,
                                    where: whereClause
                                }
                                ]
                            }
                        ]).set(
                            assoc._foreignKeys.reduce((acc, val) => {
                                acc[val.parentElement.name] = null
                                return acc
                            }, {})
                        )
                    )
                }
            }
        }
    }
    return nullForeignKeysUpdateQueries
}

module.exports = {
    whereForSelectionCriteria,
    _getDataSubjectIDField,
    _getLegalEntityIDField,
    _getField,
    _nullForeignKeysOnLegalGround,
    _getEndOfBusinessDateField,
    _buildWhereClauseForDS,
    _buildWhereClauseForDSs,
    _getEntitiesForRole,
    _getEntityForLegalGround,
    _getLegalEntity,
    whereForConditionSet,
    _getDataSubjectEmailField,
    _getDataSubjectNameField,
    _getWholeObjectTree,
    _getDataSubjectEntityByRole,
    _getLegalGroundEntitiesForDS,
    _getDataSubjectEntities
}