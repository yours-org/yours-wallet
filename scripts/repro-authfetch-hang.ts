/**
 * Recreate AuthFetch hang with full capture for research.
 * One tab. Unlock → concurrent balance spam after recreate cycles.
 *
 *   bun run scripts/repro-authfetch-hang.ts
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import puppeteer, { type Browser, type CDPSession, type Page, type Target, type WebWorker } from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = '/var/folders/8k/gjdw57kx77d74ksrvxzsvqs00000gn/T/opencode';
const logPath = resolve(outDir, 'authfetch-repro.log');
const jsonPath = resolve(outDir, 'authfetch-repro-events.json');

const secrets = existsSync(resolve(root, '.debug-wallet.json'))
  ? (JSON.parse(readFileSync(resolve(root, '.debug-wallet.json'), 'utf8')) as { password: string })
  : { password: 'testwallet1' };

type NetEvt = {
  t: number;
  kind: string;
  id?: string;
  url?: string;
  method?: string;
  status?: number;
  reqHeaders?: Record<string, string>;
  resHeaders?: Record<string, string>;
  postData?: string;
  body?: string;
  ms?: number;
  extra?: string;
};

const events: NetEvt[] = [];
const pending = new Map<
  string,
  { start: number; url: string; method: string; postData?: string; reqHeaders?: Record<string, string> }
>();

function log(line: string) {
  const row = `[${new Date().toISOString()}] ${line}`;
  console.log(row);
  appendFileSync(logPath, row + '\n');
}

function push(e: NetEvt) {
  events.push(e);
  const hdr =
    e.resHeaders &&
    Object.entries(e.resHeaders)
      .filter(([k]) => k.toLowerCase().startsWith('x-bsv') || k.toLowerCase() === 'content-type')
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  if (e.kind === 'REQ' && e.url?.includes('wallet.1sat')) {
    log(`REQ ${e.method} ${e.url} id=${e.id} post=${(e.postData || '').slice(0, 120)}`);
  } else if (e.kind === 'RES' && e.url?.includes('wallet.1sat')) {
    log(`RES ${e.status} id=${e.id} authHdrs=[${hdr || 'NONE'}]`);
  } else if (e.kind === 'FIN' && e.url?.includes('wallet.1sat')) {
    log(`FIN ${e.ms}ms id=${e.id} body=${(e.body || '').slice(0, 100)}`);
  } else if (e.kind === 'FAIL') {
    log(`FAIL id=${e.id} ${e.extra}`);
  } else if (e.kind.startsWith('SW')) {
    log(e.extra || e.kind);
  }
}

async function attachNet(target: Target, source: string, seen: Set<string>): Promise<void> {
  const key = `${source}:${target.url()}`;
  if (seen.has(key)) return;
  seen.add(key);
  let session: CDPSession;
  try {
    session = await target.createCDPSession();
    await session.send('Network.enable');
  } catch (e) {
    log(`CDP attach fail ${source}: ${e}`);
    return;
  }
  log(`CDP on ${source}`);

  session.on('Network.requestWillBeSent', (p: {
    requestId: string;
    request: { url: string; method: string; postData?: string; headers?: Record<string, string> };
  }) => {
    const id = `${source}:${p.requestId}`;
    pending.set(id, {
      start: Date.now(),
      url: p.request.url,
      method: p.request.method,
      postData: p.request.postData,
      reqHeaders: p.request.headers,
    });
    if (p.request.url.includes('wallet.1sat') || p.request.url.includes('messagebox')) {
      push({
        t: Date.now(),
        kind: 'REQ',
        id,
        url: p.request.url,
        method: p.request.method,
        postData: p.request.postData,
        reqHeaders: p.request.headers,
      });
    }
  });

  session.on('Network.responseReceived', (p: {
    requestId: string;
    response: { url: string; status: number; headers: Record<string, string> };
  }) => {
    const id = `${source}:${p.requestId}`;
    const pe = pending.get(id);
    if (!pe) return;
    // normalize header keys to lowercase
    const resHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.response.headers || {})) {
      resHeaders[k.toLowerCase()] = String(v);
    }
    (pe as { resHeaders?: Record<string, string>; status?: number }).resHeaders = resHeaders;
    (pe as { status?: number }).status = p.response.status;
    if (p.response.url.includes('wallet.1sat') || p.response.url.includes('messagebox')) {
      push({
        t: Date.now(),
        kind: 'RES',
        id,
        url: p.response.url,
        status: p.response.status,
        resHeaders,
      });
    }
  });

  session.on('Network.loadingFinished', async (p: { requestId: string }) => {
    const id = `${source}:${p.requestId}`;
    const pe = pending.get(id);
    if (!pe) return;
    const ms = Date.now() - pe.start;
    let body = '';
    try {
      const b = (await session.send('Network.getResponseBody', { requestId: p.requestId })) as {
        body?: string;
        base64Encoded?: boolean;
      };
      body = b.base64Encoded ? Buffer.from(b.body || '', 'base64').toString('utf8') : b.body || '';
    } catch {
      body = '(body unavailable)';
    }
    const resHeaders = (pe as { resHeaders?: Record<string, string> }).resHeaders;
    const status = (pe as { status?: number }).status;
    pending.delete(id);
    if (pe.url.includes('wallet.1sat') || pe.url.includes('messagebox')) {
      push({
        t: Date.now(),
        kind: 'FIN',
        id,
        url: pe.url,
        method: pe.method,
        status,
        ms,
        body,
        postData: pe.postData,
        reqHeaders: pe.reqHeaders,
        resHeaders,
      });
    }
  });

  session.on('Network.loadingFailed', (p: { requestId: string; errorText: string; canceled?: boolean }) => {
    const id = `${source}:${p.requestId}`;
    const pe = pending.get(id);
    pending.delete(id);
    push({
      t: Date.now(),
      kind: 'FAIL',
      id,
      url: pe?.url,
      extra: `${p.errorText}${p.canceled ? ' canceled' : ''} age=${pe ? Date.now() - pe.start : '?'}ms`,
    });
  });
}

async function msg(page: Page, action: string, timeoutMs: number) {
  return Promise.race([
    page.evaluate(
      (act) =>
        new Promise((resolve) => {
          const t0 = Date.now();
          chrome.runtime.sendMessage({ action: act }, (r) =>
            resolve({ ms: Date.now() - t0, r, err: chrome.runtime.lastError?.message }),
          );
        }),
      action,
    ),
    new Promise((r) => setTimeout(() => r({ timeout: true, ms: timeoutMs }), timeoutMs)),
  ]);
}

async function unlock(page: Page) {
  await page.waitForSelector('input[type=password]', { timeout: 15000 });
  const el = await page.$('input[type=password]');
  if (!el) throw new Error('no pw');
  await el.click({ clickCount: 3 });
  await el.type(secrets.password, { delay: 8 });
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => /unlock/i.test(b.textContent || ''))?.click(),
  );
  await page.waitForFunction(() => !document.querySelector('input[type=password]'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));
}

function dumpHang(reason: string) {
  log(`=== HANG ${reason} ===`);
  const open = [...pending.entries()];
  log(`CDP pending count=${open.length}`);
  for (const [id, pe] of open) {
    log(`  PENDING age=${Date.now() - pe.start}ms ${pe.method} ${pe.url}`);
    if (pe.postData) log(`    post=${pe.postData.slice(0, 200)}`);
  }
  const walletFins = events.filter((e) => e.kind === 'FIN' && e.url?.includes('wallet.1sat')).slice(-15);
  log(`last wallet FINs=${walletFins.length}`);
  for (const e of walletFins) {
    const h = e.resHeaders || {};
    log(
      `  FIN ${e.ms}ms status=${e.status} req-id=${h['x-bsv-auth-request-id'] ?? 'MISSING'} ver=${h['x-bsv-auth-version'] ?? 'MISSING'} msg-type=${h['x-bsv-auth-message-type'] ?? '-'} ident=${(h['x-bsv-auth-identity-key'] || '').slice(0, 16)} sig=${h['x-bsv-auth-signature'] ? 'yes' : 'MISSING'} nonce=${h['x-bsv-auth-nonce'] ? 'yes' : 'MISSING'} your-nonce=${h['x-bsv-auth-your-nonce'] ? 'yes' : 'MISSING'}`,
    );
    log(`    body=${(e.body || '').slice(0, 120)}`);
  }
  writeFileSync(jsonPath, JSON.stringify({ reason, at: Date.now(), events, pending: open.map(([id, p]) => ({ id, ...p })) }, null, 2));
  log(`wrote ${jsonPath}`);
}

async function main() {
  writeFileSync(logPath, '');
  writeFileSync(jsonPath, '[]');
  log('start repro');

  const browser = await puppeteer.launch({
    headless: false,
    enableExtensions: [resolve(root, 'build')],
    userDataDir: resolve(root, '.puppeteer-profile'),
    args: ['--window-size=420,760', '--no-first-run', '--no-default-browser-check'],
  });

  const seen = new Set<string>();
  const pages0 = await browser.pages();
  const page = pages0[0] || (await browser.newPage());
  for (const p of await browser.pages()) {
    if (p !== page) await p.close().catch(() => {});
  }

  const swTarget = await browser.waitForTarget(
    (x) => x.type() === 'service_worker' && x.url().endsWith('/background.js'),
    { timeout: 60_000 },
  );
  const worker = await swTarget.worker();
  if (!worker) throw new Error('no worker');
  await attachNet(swTarget, 'sw', seen);
  await attachNet(page.target(), 'page', seen);

  worker.on('console', (m) => {
    const s = m.text();
    if (
      s.includes('[lifecycle]') ||
      s.includes('[storageLock]') ||
      s.includes('[remoteHttp]') ||
      s.includes('STILL_') ||
      /error/i.test(s)
    ) {
      push({ t: Date.now(), kind: 'SW', extra: s.slice(0, 300) });
    }
  });

  const extensionId = new URL(worker.url()).hostname;
  log(`ext=${extensionId} ver=${await worker.evaluate(() => chrome.runtime.getManifest().version)}`);

  const ui = `chrome-extension://${extensionId}/index.html`;
  await page.setViewport({ width: 400, height: 700 });
  await page.goto(ui, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1000));

  // Ensure clean start: lock then unlock
  await msg(page, 'WALLET_LOCKED', 10000);
  await page.evaluate(async () => {
    await chrome.storage.local.set({ isLocked: true, lastActiveTime: 0 });
    await chrome.storage.session.remove('passKey');
  });
  await page.goto(ui, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 800));
  await unlock(page);

  // Cycle lock/unlock + concurrent balances to stress AuthFetch
  for (let cycle = 1; cycle <= 8; cycle++) {
    log(`=== cycle ${cycle} lock ===`);
    const lk = await msg(page, 'WALLET_LOCKED', 15000);
    log(`lock ${JSON.stringify(lk)}`);
    if ((lk as { timeout?: boolean }).timeout) {
      dumpHang(`lock-timeout-cycle-${cycle}`);
      break;
    }
    await page.evaluate(async () => {
      await chrome.storage.local.set({ isLocked: true, lastActiveTime: 0 });
      await chrome.storage.session.remove('passKey');
    });
    await page.goto(ui, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 500));
    await unlock(page);

    // Concurrent balances — this previously triggered hang
    log(`=== cycle ${cycle} spam balances ===`);
    const spam = await Promise.all([
      msg(page, 'getBalance', 25000),
      msg(page, 'getBalance', 25000),
      msg(page, 'getBalance', 25000),
    ]);
    log(`spam results ${JSON.stringify(spam)}`);
    const hung = spam.some((s) => (s as { timeout?: boolean }).timeout);
    if (hung) {
      dumpHang(`balance-spam-cycle-${cycle}`);
      await browser.close();
      process.exit(2);
    }
    const bad = spam.some((s) => !(s as { r?: { success?: boolean } }).r?.success);
    if (bad) {
      dumpHang(`balance-fail-cycle-${cycle}`);
      await browser.close();
      process.exit(3);
    }
  }

  dumpHang('completed-no-hang');
  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  try {
    dumpHang('exception');
  } catch {
    // ignore
  }
  process.exit(1);
});
