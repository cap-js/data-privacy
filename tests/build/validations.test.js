const path = require('path');
const fs = require('fs');
const cds = require('@sap/cds');
const TempUtil = require('./tempUtil.js');
const tempUtil = new TempUtil(__filename);
process.env.NO_COLOR = true; // Required to parse build tasks
const { _processTasks } = require('./util.js');
const { register } = require('@sap/cds-dk/lib/build');

const buildTasks = [
  {
    src: 'srv',
    dest: 'out',
    for: 'data-privacy',
    options: {
      model: [
        'db',
        'srv',
        'app',
        'app/*',
        '@sap/cds/srv/outbox',
        '../../../../../db/dpi.cds',
        '../../../../../srv/TableHeaderBlocking.cds',
        '../../../../../srv/DPIInformation.cds',
      ],
    },
  },
];

function readMtaRetentionConfig(appRoot) {
  const mtaContent = fs.readFileSync(path.join(appRoot, 'mta.yaml'), 'utf-8');
  const mta = cds.parse.yaml(mtaContent);
  const retentionResource = mta.resources.find(
    (r) =>
      r.parameters?.service === 'data-privacy-integration-service' &&
      r.parameters?.config?.dataPrivacyConfiguration?.configType === 'retention',
  );
  return retentionResource?.parameters?.config?.dataPrivacyConfiguration?.retentionConfiguration;
}

describe('testing cds build', () => {
  let log = cds.test.log();
  const DIR_APP1 = path.join(__dirname, 'scenarios', 'app1');
  const DIR_APP2 = path.join(__dirname, 'scenarios', 'app2');
  const DIR_APP3 = path.join(__dirname, 'scenarios', 'app3');
  beforeAll(() => {
    require('../../cds-plugin.js');
    cds.build = require('@sap/cds-dk/lib/build');
    register('data-privacy', require('../../lib/build/index.js'));
  });
  afterAll(async () => {
    return tempUtil.cleanUp();
  });

  test('Throw warning when outdated org attribute is given', async () => {
    const appRoot = await tempUtil.mkTempProject(DIR_APP1);
    await _processTasks(appRoot, buildTasks);
    expect(log.output.length).toBeGreaterThan(0);
    expect(log.output).toMatch(
      /Your current deployment configuration contains an outdated organizational attribute/,
    );
    expect(log.output).toMatch(/build completed/);
  });

  test('No warning for correct model', async () => {
    const appRoot = await tempUtil.mkTempProject(DIR_APP2);
    await _processTasks(appRoot, buildTasks);
    expect(log.output.length).toBeGreaterThan(0);
    expect(log.output).not.toMatch(
      /Your current deployment configuration contains an outdated organizational attribute/,
    );
    expect(log.output).toMatch(/build completed/);
  });

  test('Build adds dataSubjectRoles and organizationAttributes to fresh mta.yaml', async () => {
    const appRoot = await tempUtil.mkTempProject(DIR_APP3);
    await _processTasks(appRoot, buildTasks);
    const retentionConfig = readMtaRetentionConfig(appRoot);

    expect(retentionConfig.dataSubjectRoles).toHaveLength(1);
    expect(retentionConfig.dataSubjectRoles).toEqual(
      expect.arrayContaining([expect.objectContaining({ dataSubjectRoleName: 'Customer' })]),
    );
    expect(retentionConfig.organizationAttributes).toHaveLength(1);
    expect(retentionConfig.organizationAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationAttributeName: 'sap.capire.bookshop.LegalEntities' }),
      ]),
    );
  });

  test('Build does not change existing retention config idempotently', async () => {
    const appRoot = await tempUtil.mkTempProject(DIR_APP2);
    await _processTasks(appRoot, buildTasks);
    const retentionConfig = readMtaRetentionConfig(appRoot);

    expect(retentionConfig.dataSubjectRoles).toHaveLength(1);
    expect(retentionConfig.dataSubjectRoles).toEqual(
      expect.arrayContaining([expect.objectContaining({ dataSubjectRoleName: 'Customer' })]),
    );
    expect(retentionConfig.organizationAttributes).toHaveLength(1);
    expect(retentionConfig.organizationAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationAttributeName: 'sap.capire.bookshop.LegalEntities' }),
      ]),
    );
  });
});
