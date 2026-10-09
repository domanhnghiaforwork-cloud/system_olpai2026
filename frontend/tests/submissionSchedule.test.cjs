const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/countdown.ts'), 'utf8'),
  {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
new Function('exports', code)(exportsObject);
const {getDependentLockStatus, opensBeforeProblem, toVietnamDatetimeLocal, vietnamDatetimeToUtc} = exportsObject;

test('Public and Private keep their separate countdowns and inherit the problem gate', () => {
  const now = Date.parse('2026-10-09T02:00:00Z');
  const parent = {unlock_at: '2026-10-09T03:00:00Z'};
  const publicSplit = {};
  const privateSplit = {unlock_at: '2026-10-09T04:00:00Z'};
  assert.equal(getDependentLockStatus(publicSplit, parent, now).remainingMs, 60 * 60 * 1000);
  assert.equal(getDependentLockStatus(privateSplit, parent, now).remainingMs, 2 * 60 * 60 * 1000);
  assert.equal(getDependentLockStatus(publicSplit, parent, now + 60 * 60 * 1000).type, 'UNLOCKED');
  assert.equal(getDependentLockStatus(privateSplit, parent, now + 60 * 60 * 1000).type, 'COUNTDOWN');
  assert.equal(getDependentLockStatus(privateSplit, parent, now + 2 * 60 * 60 * 1000).type, 'UNLOCKED');
});

test('manual locks and rescheduling the parent cannot expose early submission', () => {
  const now = Date.parse('2026-10-09T02:00:00Z');
  const split = {unlock_at: '2026-10-09T03:00:00Z'};
  assert.equal(getDependentLockStatus(split, {is_locked: true}, now).type, 'LOCKED');
  assert.equal(getDependentLockStatus({is_locked: true}, {unlock_at: split.unlock_at}, now).type, 'LOCKED');
  assert.equal(getDependentLockStatus(split, {unlock_at: '2026-10-09T04:00:00Z'}, now).remainingMs, 2 * 60 * 60 * 1000);
});

test('countdown priority chooses the larger remaining time without modifying either schedule', () => {
  const now = Date.parse('2026-10-09T02:00:00Z');
  const at = minutes => new Date(now + minutes * 60_000).toISOString();
  for (const [parentMinutes, splitMinutes, expectedMinutes] of [[30, 10, 30], [10, 30, 30], [30, 30, 30]]) {
    for (const split of ['public', 'private']) {
      const parent = Object.freeze({unlock_at: at(parentMinutes)});
      const own = Object.freeze({unlock_at: at(splitMinutes)});
      const status = getDependentLockStatus(own, parent, now);
      assert.equal(status.type, 'COUNTDOWN', split);
      assert.equal(status.remainingMs, expectedMinutes * 60_000, split);
      assert.equal(parent.unlock_at, at(parentMinutes));
      assert.equal(own.unlock_at, at(splitMinutes));
      assert.equal(getDependentLockStatus(own, parent, now + expectedMinutes * 60_000).type, 'UNLOCKED');
    }
  }
  assert.equal(getDependentLockStatus({}, {unlock_at: at(30)}, now).remainingMs, 30 * 60_000);
});

test('Vietnam schedule fields preserve exact timestamps and reject earlier dates', () => {
  const parent = '2026-10-09T02:00:37.123Z';
  const local = toVietnamDatetimeLocal(parent, true);
  assert.equal(local, '2026-10-09T09:00:37.123');
  assert.equal(vietnamDatetimeToUtc(local), parent);
  assert.equal(opensBeforeProblem(vietnamDatetimeToUtc('2026-10-09T09:00:37.122'), parent), true);
  assert.equal(opensBeforeProblem(vietnamDatetimeToUtc(local), parent), false);
  assert.equal(opensBeforeProblem(null, parent), false);
});
