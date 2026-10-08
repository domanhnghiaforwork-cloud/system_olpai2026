const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(fetch) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/leaderboardEvents.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, fetch, AbortController, TextDecoder, setTimeout, clearTimeout });
  return exports.subscribeLeaderboardEvents;
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const encoder = new TextEncoder();

test('fragmented events refresh; heartbeat does not; cleanup aborts the connection', async () => {
  let stream;
  let signal;
  let updates = 0;
  const states = [];
  const subscribe = load(async (url, options) => {
    assert.equal(url, '/api/leaderboard/events?type=private');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    signal = options.signal;
    const body = new ReadableStream({ start(controller) {
      stream = controller;
      signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
    } });
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  });
  const stop = subscribe('/api/leaderboard/events?type=private', { Authorization: 'Bearer test-token' }, () => { updates++; }, (state) => states.push(state));
  try {
    await pause(10);
    assert.deepEqual(states, ['connecting']);
    for (const chunk of ['event: rea', 'dy\r', '\ndata: {"version":0}\r\n\r\n', ': heartbeat\n\n', 'event: leaderboard-change\ndata:', ' {"version":1}\n\n']) {
      stream.enqueue(encoder.encode(chunk));
    }
    await pause(10);
    assert.equal(updates, 2);
    assert.deepEqual(states, ['connecting', 'connected']);
  } finally { stop(); }
  await pause(10);
  assert.equal(signal.aborted, true);
  assert.deepEqual(states, ['connecting', 'connected', 'disconnected']);
});

test('reconnect refreshes after a dropped stream and stop cancels retry', async () => {
  let calls = 0;
  let updates = 0;
  const subscribe = load(async () => {
    calls++;
    return new Response('event: ready\ndata: {"version":1}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  const stop = subscribe('/events', {}, () => { updates++; });
  try {
    await pause(2100);
    assert.equal(calls, 2);
    assert.equal(updates, 2);
  } finally { stop(); }
  await pause(2100);
  assert.equal(calls, 2);
});

test('permission denial stops reconnecting', async () => {
  let calls = 0;
  const states = [];
  const subscribe = load(async () => { calls++; return new Response('', { status: 403 }); });
  const stop = subscribe('/events?type=private', {}, () => assert.fail('must not refresh'), (state) => states.push(state));
  await pause(2100);
  stop();
  assert.equal(calls, 1);
  assert.deepEqual(states, ['connecting', 'disconnected']);
});
