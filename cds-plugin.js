const cds = require('@sap/cds');
const enhanceModel = require('./lib/model/enhanceModel');

cds.on('compile.for.runtime', csn => { enhanceModel(csn) })
//cds.on('compile.to.edmx', csn => { enhanceModel(csn) })
cds.on('compile.to.dbx', csn => { enhanceModel(csn) })

cds.add?.register?.('data-privacy', require('./lib/add'))
cds.build?.register?.('data-privacy', require('./lib/build'))