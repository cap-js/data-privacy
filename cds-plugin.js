const cds = require('@sap/cds');

if (process.env.NODE_ENV !== 'production') {
    const dpiSrvGeneration = require('./lib/model/srv-generation')
    //Else model is loaded in build and included in generated csn.json for deployed apps?
    //Also used during build
    //TODO: For npm run build / cds.compile via cli this somehow has to be disabled
    cds.on('loaded', m => {
        const dpiServiceLoader = dpiSrvGeneration();
        dpiServiceLoader(m);
    });
}

cds.add?.register?.('data-privacy', require('./lib/add'))
cds.build?.register?.('data-privacy', require('./lib/build'))