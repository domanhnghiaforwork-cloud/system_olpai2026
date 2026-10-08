// Local headless-browser smoke check; does not change application data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'olpai-sse-browser-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  let ws;
  let debugPage;
  const waitFor = async (condition) => {
    const deadline = Date.now() + 45_000;
    while (!await condition()) {
      if (Date.now() > deadline) throw new Error('Browser check timed out: ' + (debugPage ? await debugPage() : 'startup'));
      await pause(100);
    }
  };
  try {
    const activePort = path.join(profile, 'DevToolsActivePort');
    await waitFor(() => fs.existsSync(activePort));
    const port = fs.readFileSync(activePort, 'utf8').split('\n')[0];
    const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    const streams = [];
    const cancelled = new Set();
    const exceptions = [];
    const apiRequests = [];
    const urls = new Map();
    const failed = [];
    ws.addEventListener('message', ({ data }) => {
      const event = JSON.parse(data);
      if (event.id) {
        const task = pending.get(event.id);
        pending.delete(event.id);
        if (event.error) task?.reject(new Error(JSON.stringify(event.error)));
        else task?.resolve(event.result);
      }
      if (event.method === 'Network.requestWillBeSent' && event.params.request.url.includes('/api/leaderboard/events')) streams.push(event.params.requestId);
      if (event.method === 'Network.requestWillBeSent' && /\/api\/|runtime-config/.test(event.params.request.url)) apiRequests.push(event.params.request.url);
      if (event.method === 'Network.requestWillBeSent') urls.set(event.params.requestId, event.params.request.url);
      if (event.method === 'Network.loadingFailed' && !event.params.canceled) failed.push({ url: urls.get(event.params.requestId), error: event.params.errorText });
      if (event.method === 'Network.loadingFailed' && event.params.canceled) cancelled.add(event.params.requestId);
      if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.text);
    });
    const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    const cdp = (method, params) => call(method, params, sessionId);
    const evaluate = async (expression) => {
      const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const click = (label) => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)})?.click()`);
    debugPage = async () => JSON.stringify({ page: await evaluate("JSON.stringify({url:location.href, hidden:document.hidden, text:document.body?.innerText.slice(0,1800)})"), apiRequests, exceptions, failed });
    await cdp('Network.enable');
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Page.navigate', { url: 'http://localhost:3000/' });
    await cdp('Page.bringToFront');
    await waitFor(() => evaluate("document.querySelector('h1') !== null"));
    assert.equal(streams.length, 0, 'Home must not connect SSE');
    await click('Bảng xếp hạng');
    await waitFor(() => streams.length >= 1);
    await waitFor(() => evaluate("document.querySelector('[role=status]')?.classList.contains('text-green-600')"));
    await waitFor(() => evaluate("document.querySelector('[aria-label=\"Bảng xếp hạng tổng Public\"] tbody tr') !== null"));
    await click('Trang chủ');
    await waitFor(() => cancelled.has(streams[0]));
    await click('Bảng xếp hạng');
    await waitFor(() => streams.length >= 2);
    await evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__sseHidden }); window.__sseHidden = true; document.dispatchEvent(new Event('visibilitychange'))");
    await waitFor(() => cancelled.has(streams[1]));
    await waitFor(() => evaluate("document.querySelector('[role=status]')?.classList.contains('text-red-600')"));
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.leaderboard-connecting-dots')).animationName"), 'leaderboard-connecting-dots');
    await evaluate("window.__sseHidden = false; document.dispatchEvent(new Event('visibilitychange'))");
    await waitFor(() => streams.length >= 3);
    await waitFor(() => evaluate("document.querySelector('[role=status]')?.classList.contains('text-green-600')"));
    await pause(1500);
    assert.deepEqual(exceptions, []);
    console.log('PASS: SSE lifecycle; connected status green; disconnected status red with animated dots; reconnect restores green; no browser exceptions.');
  } finally {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' }));
      await pause(300);
    }
    ws?.close();
    chrome.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
