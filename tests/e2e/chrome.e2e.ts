// Chrome E2E against dist/chrome: WebRTC, kill switch, and a toggle racing a health check.
// Run: npm run build:chrome && SE_FORCE_BROWSER_DOWNLOAD=true SE_BROWSER_VERSION=dev npm run e2e:chrome
//
// Branded Chrome (stable, Dev) ignores --load-extension; selenium then downloads Chrome for
// Testing, which still honours it. CHROME_BIN points at another unbranded build instead.
// Leak detection: --host-resolver-rules maps fixture.e2e to 127.0.0.1, so a request that goes
// direct reaches the `direct` server. Through the SOCKS server the same host reaches `proxied`.
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Builder, type WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
// @ts-expect-error plain .mjs script without types
import { createSocksServer } from '../../scripts/socks5-server.mjs';

const DIST = resolve('dist/chrome');
// Chrome derives an unpacked extension's ID from its path: sha256, first 32 hex digits as a-p.
const ID = [...createHash('sha256').update(DIST).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('');
const HOST = 'fixture.e2e';

// A page that gathers its WebRTC candidates, then sets its title to "done".
const FIXTURE = `<!doctype html><title>fixture</title><script>
const found = [];
const finish = () => { window.candidates = found; document.title = 'done'; };
try {
  const pc = new RTCPeerConnection();
  pc.createDataChannel('x');
  pc.onicecandidate = (e) => (e.candidate ? found.push(e.candidate.candidate) : finish());
  pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(finish);
  setTimeout(finish, 4000);
} catch { finish(); }
</script>`;

function server(body: string) {
  const s = { hits: 0, server: null as unknown as Server };
  s.server = createServer((_req, res) => {
    s.hits++;
    res.setHeader('content-type', 'text/html');
    res.end(body);
  });
  return s;
}
const listen = (s: Server) =>
  new Promise<number>((ok) =>
    s.listen(0, '127.0.0.1', () => ok((s.address() as AddressInfo).port)),
  );

const direct = server('direct');
const proxied = server(FIXTURE);
const sockets = new Set<Socket>();
let socks: Server;
let url = '';
let driver: WebDriver;

async function launch(): Promise<WebDriver> {
  const options = new chrome.Options().addArguments(
    '--headless=new',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'noleaker-chrome-'))}`,
    `--load-extension=${DIST}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--host-resolver-rules=MAP ${HOST} 127.0.0.1`,
    '--no-first-run',
  );
  if (process.env.CHROME_BIN) options.setChromeBinaryPath(process.env.CHROME_BIN);
  return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

/** Run `body` (async code using `chrome`) on an extension page. */
async function ext<T>(body: string): Promise<T> {
  await driver.get(`chrome-extension://${ID}/options/index.html`);
  const out = await driver.executeAsyncScript<string>(`
    const done = arguments[arguments.length - 1];
    (async () => { ${body} })().then(
      (v) => done(JSON.stringify({ v })),
      (e) => done(JSON.stringify({ e: String(e) })),
    );`);
  const r = JSON.parse(out) as { v?: T; e?: string };
  if (r.e) throw new Error(r.e);
  return r.v as T;
}

const state = () =>
  ext<Record<string, unknown>>(`return (await chrome.storage.local.get('state')).state;`);

async function until(what: string, check: () => Promise<boolean>, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  const dump = await ext(`const { state, log } = await chrome.storage.local.get(['state', 'log']);
    const { profiles, ...rest } = state ?? {};
    return { state: rest, log: (log ?? []).map((l) => l.level + ': ' + l.msg) };`).catch(
    (err: Error) => `unavailable: ${err.message}`,
  );
  throw new Error(
    `Timed out waiting for: ${what} (direct hits: ${direct.hits})\n${JSON.stringify(dump, null, 2)}`,
  );
}

const verified = () =>
  until('proxy on and controls verified', async () => {
    const s = await state();
    return s.enabled === true && !!s.controlsVerifiedAt && !s.protectionError;
  });

/** Load the fixture a few times; a refused load is fine, only where it goes matters. */
async function browse(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) await driver.get(`${url}?n=${i}`).catch(() => undefined);
}

before(async () => {
  const proxiedPort = await listen(proxied.server);
  const directPort = await listen(direct.server);
  url = `http://${HOST}:${directPort}/`;
  socks = createSocksServer({
    route: (host: string, port: number) =>
      host === HOST ? ['127.0.0.1', proxiedPort] : [host, port],
  });
  socks.on('connection', (s: Socket) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  const socksPort = await listen(socks);
  driver = await launch();
  await ext(`await chrome.storage.local.set({ state: {
    profiles: [{ id: 'e2e', name: 'e2e', host: '127.0.0.1', port: ${socksPort} }],
    activeProfileId: 'e2e',
    enabled: true,
  } });`);
  await verified();
  direct.hits = 0;
});

after(async () => {
  await driver?.quit().catch(() => undefined);
  for (const s of [direct.server, proxied.server, socks]) s?.close();
  for (const s of sockets) s.destroy();
});

test('WebRTC: no real-IP candidates', async () => {
  await driver.get(url);
  await until('fixture gathered candidates', async () => (await driver.getTitle()) === 'done');
  const candidates = await driver.executeScript<string[]>('return window.candidates || [];');
  const ip = /\b(?!0\.0\.0\.0\b)\d{1,3}(\.\d{1,3}){3}\b|\b[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,7}\b/i;
  assert.deepEqual(
    candidates.filter((c) => ip.test(c)),
    [],
  );
  assert.ok(proxied.hits > 0, 'the fixture was served through the proxy');
  assert.equal(direct.hits, 0);
});

test('turning the proxy off during a health check stays off', async () => {
  // The popup writes `enabled` while the background is mid-check and writing its own fields.
  await ext(`void chrome.runtime.sendMessage({ type: 'refreshExit' });
    await navigator.locks.request('state', async () => {
      const s = (await chrome.storage.local.get('state')).state;
      await chrome.storage.local.set({ state: { ...s, enabled: false } });
    });`);
  await new Promise((r) => setTimeout(r, 15_000)); // let the check finish and write
  assert.equal((await state()).enabled, false);
  await ext(`await navigator.locks.request('state', async () => {
    const s = (await chrome.storage.local.get('state')).state;
    await chrome.storage.local.set({ state: { ...s, enabled: true } });
  });`);
  await verified();
});

test('kill switch: SOCKS server down, no direct request', async () => {
  socks.close();
  for (const s of sockets) s.destroy();
  await browse();
  await until(
    'kill switch active',
    async () => {
      await browse(1);
      return (await state()).killSwitchActive === true;
    },
    120_000,
  );
  await browse();
  assert.equal(direct.hits, 0);
});
