const cds = require('@sap/cds');
const LOG = cds.log('data-privacy');
cds._dpi = {
    buildMessages: []
}
cds._dpi.log = function log(module, options) {
        if (cds.cli.command === 'build') {
            const {BuildMessage} = require('@sap/cds-dk/lib/build/util');
            return {
                error: (...parts) => cds._dpi.buildMessages.push(new BuildMessage(parts.join(' '), 'Error')),
                info: (...parts) => cds._dpi.buildMessages.push(new BuildMessage(parts.join(' '), 'Info')),
                warn: (...parts) => cds._dpi.buildMessages.push(new BuildMessage(parts.join(' '), 'Warning')),
                debug: (...parts) => cds._dpi.buildMessages.push(new BuildMessage(parts.join(' '), 'Debug'))
            }
        } else {
            return cds.log(module, options)
        }
}

const enhanceModel = require('./lib/csn-enhancements/enhanceModel');
const path = require('path');
const fs = require('fs/promises');
require('./lib/csn-runtime-extensions');

cds.on('compile.for.runtime', csn => { enhanceModel(csn) })
//cds.on('compile.to.edmx', csn => { enhanceModel(csn) })
cds.on('compile.to.dbx', csn => { enhanceModel(csn) })

cds.on('loaded', csn => { cds.cli.command === 'build' && enhanceModel(csn) })

cds.on('listening', async () => {
    if (!cds.env.requires['data-privacy-retention'].applicationName) {
        const {name} = JSON.parse(await fs.readFile(path.join(cds.root, 'package.json')));
        LOG.debug
        cds.env.requires['data-privacy-retention'].applicationName = name;
    }
})

cds.build?.register?.('data-privacy', require('./lib/build'))