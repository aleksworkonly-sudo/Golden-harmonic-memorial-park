'use strict';

const fs = require('node:fs');
const { MAX_BYTES, sealSnapshot, verifyBackup, restoreRehearsal } = require('../../lib/payments/rehearsal-snapshot');
const { inventory, planMigration, applyRehearsal } = require('../../lib/payments/migration-rehearsal');
const { auditRelease } = require('../../lib/payments/release-audit');

function readJSON(file) {
  if (!file || !/\.json$/i.test(file)) throw Error('Use an explicitly named local JSON input.');
  const fd = fs.openSync(file,'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES * 2) throw Error('Input is not a supported bounded JSON file.');
    return JSON.parse(fs.readFileSync(fd,'utf8').replace(/^\uFEFF/,''));
  } finally { fs.closeSync(fd); }
}

function main(args) {
  const [command,...paths] = args;
  if (!command || command === '--help') {
    console.log('Offline JSON tools (no database connection): inventory snapshot.json output.json; plan snapshot.json decisions.json output.json; apply snapshot.json plan.json output.json; backup snapshot.json output.json; verify backup.json; restore backup.json empty-target.json output.json; audit snapshot.json output.json. Outputs must not already exist.');
    return;
  }
  const arity = {inventory:2,plan:3,apply:3,backup:2,verify:1,restore:3,audit:2};
  if (!Object.hasOwn(arity,command) || paths.length !== arity[command]) throw Error(
    'Usage: inventory snapshot.json output.json | plan snapshot.json decisions.json output.json | apply snapshot.json plan.json output.json | backup snapshot.json output.json | verify backup.json | restore backup.json isolated-target.json output.json | audit snapshot.json output.json');
  let result;
  const input = readJSON(paths[0]);
  if (command === 'inventory') result = inventory(input);
  if (command === 'plan') result = planMigration(input,readJSON(paths[1]));
  if (command === 'apply') result = applyRehearsal(input,readJSON(paths[1]));
  if (command === 'backup') result = sealSnapshot(input);
  if (command === 'restore') result = restoreRehearsal(input,readJSON(paths[1]));
  if (command === 'audit') result = auditRelease(input);
  if (command === 'verify') { verifyBackup(input); console.log('Portable backup integrity verified; this is not a production restore test.'); return; }
  const output = paths.at(-1);
  if (!/\.json$/i.test(output)) throw Error('Output must be a new local JSON file.');
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(`Saved ${command} rehearsal output. No database connection or production activation occurred.`);
  if (command === 'audit' && !result.localDataChecksPassed) process.exitCode = 2;
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(e.code ? `${e.code}: ${e.message}` : 'Rehearsal failed. Check command syntax, bounded JSON inputs and a new output path. Existing files were not overwritten.'); process.exitCode = 1; }
}
module.exports = { main, readJSON };
