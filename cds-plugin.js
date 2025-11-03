const cds = require('@sap/cds');
const LOG = cds.log('data-privacy');
const enhanceModel = require('./lib/csn-enhancements/enhanceModel');
const path = require('path');
const fs = require('fs/promises');
require('./lib/csn-runtime-extensions');

cds.on('compile.for.runtime', csn => { enhanceModel(csn) })
//cds.on('compile.to.edmx', csn => { enhanceModel(csn) })
cds.on('compile.to.dbx', csn => { enhanceModel(csn) })

cds.on('loaded', csn => { cds.cli.command === 'build' && enhanceModel(csn) })

cds.on('listening', async app => {
    if (!cds.env.requires['data-privacy-retention'].applicationName) {
        const {name} = JSON.parse(await fs.readFile(path.join(cds.root, 'package.json')));
        LOG.debug
        cds.env.requires['data-privacy-retention'].applicationName = name;
    }
})

cds.build?.register?.('data-privacy', require('./lib/build'))