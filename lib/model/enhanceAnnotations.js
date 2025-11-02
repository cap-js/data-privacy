/**
   * Some OData annotations mean the same thing. To avoid situations, where devs have to annotate the entity multiple times for the same meaning, 
   * the annotation helper ensures, that all kinds of a meaning are covered
   * @param {*} m 
   */
module.exports = function annotationHelper(m) {
    const isPersonal = (element) => element['@PersonalData.IsPotentiallyPersonal'] = true
    const isSensitive = (element) => element['@PersonalData.IsPotentiallySensitive'] = true
    const annoIsPersonal = (def, annotation, altForWrite) => {
        altForWrite = altForWrite || def
        if (def[annotation] && altForWrite.elements[def[annotation]['=']]) {
            isPersonal(altForWrite.elements[def[annotation]['=']])
        }
    }
    const annoIsSensitive = (def, annotation, altForWrite) => {
        altForWrite = altForWrite || def
        if (def[annotation] && altForWrite.elements[def[annotation]['=']]) {
            isSensitive(altForWrite.elements[def[annotation]['=']])
        }
    }
    const nameProperties = { surname: 1, given: 1, additional: 1, prefix: 1, suffix: 1 },
        addressProperties = { building: 1, street: 1, district: 1, locality: 1, region: 1, code: 1, country: 1, pobox: 1, ext: 1, careof: 1 }
    for (let each in m.definitions) {
        let def = m.definitions[each]
        for (let ele in def.elements) {
            const eleDef = def.elements[ele]
            if (eleDef['@Communication.IsEmailAddress']) isPersonal(eleDef)
            else if (eleDef['@Communication.IsPhoneNumber']) isPersonal(eleDef)
        }
        for (const name in nameProperties) {
            annoIsPersonal(def, `@Communication.Contact.n.${name}`)
        }
        annoIsPersonal(def, '@Communication.Contact.nickname')
        annoIsSensitive(def, '@Communication.Contact.bday')
        annoIsSensitive(def, '@Communication.Contact.anniversary')
        annoIsSensitive(def, '@Communication.Contact.gender')
        annoIsSensitive(def, '@Communication.Contact.photo')
        annoIsPersonal(def, '@Communication.Contact.title')
        if (def['@Communication.Contact.adr'])
            for (const adr of def['@Communication.Contact.adr']) {
                for (const a in addressProperties)
                    annoIsPersonal(adr, a, def)
            }
        if (def['@Communication.Contact.tel'])
            for (const tel of def['@Communication.Contact.tel']) {
                annoIsPersonal(tel, `uri`, def)
                if (tel.uri['=']) def.elements[tel.uri['=']]['@Communication.IsPhoneNumber'] = true
            }
        if (def['@Communication.Contact.email'])
            for (const email of def['@Communication.Contact.email']) {
                annoIsPersonal(email, `address`, def)
                if (email.address['=']) def.elements[email.address['=']]['@Communication.IsEmailAddress'] = true
            }
        if (def['@Communication.Address'])
            for (const adr of def['@Communication.Address']) {
                for (const a in addressProperties)
                    annoIsPersonal(adr, a, def)
            }
    }
}