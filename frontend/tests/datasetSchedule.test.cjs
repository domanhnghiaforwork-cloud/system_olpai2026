const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(name, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib', name + '.ts'), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => imports[name], exports);
  return exports;
}
const countdown = load('countdown');
const {getDatasetLockStatus, datasetOpensBeforeProblem, toDatasetDatetimeLocal} = load('datasetSchedule', {'./countdown': countdown});
const now = Date.parse('2026-10-09T02:00:00Z');

test('each link retains its own later countdown; the later gate determines release', () => {
  const parent = {unlock_at: '2026-10-09T03:00:00Z'};
  const later = {unlock_at: '2026-10-09T04:00:00Z'};
  assert.equal(getDatasetLockStatus(later, parent, now).remainingMs, 2 * 60 * 60 * 1000);
  assert.equal(getDatasetLockStatus(later, parent, now + 60 * 60 * 1000).type, 'COUNTDOWN');
  assert.equal(getDatasetLockStatus(later, parent, now + 2 * 60 * 60 * 1000).type, 'UNLOCKED');
  assert.equal(getDatasetLockStatus(parent, later, now).remainingMs, 2 * 60 * 60 * 1000);
});

test('manual locks remain independent when the other gate has a countdown', () => {
  const timed = {unlock_at: '2026-10-09T03:00:00Z'};
  assert.equal(getDatasetLockStatus({is_locked: true}, timed, now).type, 'LOCKED');
  assert.equal(getDatasetLockStatus(timed, {is_locked: true}, now).type, 'LOCKED');
  assert.equal(getDatasetLockStatus({}, timed, now).type, 'COUNTDOWN');
  assert.equal(getDatasetLockStatus({}, timed, now + 60 * 60 * 1000).type, 'UNLOCKED');
});

test('schedule validation compares actual timestamps including timezone offsets', () => {
  const parent = '2026-10-09T02:00:00Z';
  assert.equal(datasetOpensBeforeProblem('2026-10-09T08:59:59+07:00', parent), true);
  assert.equal(datasetOpensBeforeProblem('2026-10-09T09:00:00+07:00', parent), false);
  assert.equal(datasetOpensBeforeProblem('2026-10-09T10:00:00+07:00', parent), false);
  assert.equal(datasetOpensBeforeProblem(null, parent), false);
});

test('form defaults preserve exact parent/dataset timestamps including seconds', () => {
  const timestamp = '2026-10-09T02:00:37.123Z';
  const local = toDatasetDatetimeLocal(timestamp);
  assert.equal(new Date(local).getTime(), Date.parse(timestamp));
  assert.equal(datasetOpensBeforeProblem(new Date(local).toISOString(), timestamp), false);
  assert.equal(toDatasetDatetimeLocal(null), '');
});
