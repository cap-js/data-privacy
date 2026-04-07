const cds = require('@sap/cds');
const { BuildTaskEngine, build } = require('@sap/cds-dk/lib/build');

async function _build(project, options) {
  options ??= {};
  cds.root = project;
  cds.env = cds.env.for('cds', project);
  cds.requires = cds.env.requires;
  return build({ root: project, ...options });
}

async function _processTasks(project, tasks, options) {
  options ??= {};
  cds.root = project;
  cds.env = cds.env.for('cds', project);
  cds.requires = cds.env.requires;
  return new BuildTaskEngine(options).processTasks(tasks);
}

function _find(tasks, taskFor, taskSrc) {
  return tasks.find((task) => task.for === taskFor && (!taskSrc || task.src === taskSrc));
}

// REVISIT: breaks easily, should find better approach
function _getTasksFromLog(logs) {
  const buildLogs = logs.find((log) => log.includes('building project with'));
  const cleaned = buildLogs.replace(/\x1b\[\d+m/g, ''); /* remove color codes */ // eslint-disable-line no-control-regex
  const objStr = cleaned.replace(/^.*?building project with\s*/, '');
  return eval(`(${objStr})`);
}

module.exports = {
  _build,
  _processTasks,
  _find,
  _getTasksFromLog,
};
