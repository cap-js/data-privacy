const cds = require('@sap/cds');

cds.once('listening', async () => {
  const DPIRetention = await cds.connect.to('sap.ilm.RetentionService');
  DPIRetention.prepend(() => {
    DPIRetention.on('dataSubjectInformation', async () => {
      return [{ dataSubjectId: 'ABC', emailId: 'abc@def.com', name: 'Max Muster' }];
    });
  });
});

module.exports = cds.server;
