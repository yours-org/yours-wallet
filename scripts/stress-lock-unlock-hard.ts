/**
 * Hard lock/unlock stress + real CDP Network capture (DevTools-equivalent).
 * One browser tab only.
 *
 *   bun run scripts/stress-lock-unlock-hard.ts
 */
import { appendFileSync, existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import puppeteer, { type Browser, type CDPSession, type Page, type Target, type WebWorker } from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const extensionPath = resolve(root, 'build');
const profileDir = resolve(root, '.puppeteer-profile');
const secretsPath = resolve(root, '.debug-wallet.json');
const netLogPath = resolve('/var/folders/8k/gjdw57kx77d74ksrvxzsvqs00000gn/T/opencode/stress-net.log');
const outLogPath = resolve('/var/folders/8k/gjdw57kx77d74ksrvxzsvqs00000gn/T/opencode/stress-hard7.log');

const CYCLES = 15;
const BALANCE_TIMEOUT_MS = 25_000;
const LOCK_TIMEOUT_MS = 45_000;

const secrets = existsSync(secretsPath)
  ? (JSON.parse(readFileSync(secretsPath, 'utf8')) as { password: string })
  : { password: 'testwallet1' };

function log(line: string) {
  console.log(line);
  try {
    appendFileSync(outLogPath, line + '\n');
  } catch {
    // ignore
  }
}

type NetEntry = {
  id: string;
  cdpId: string;
  url: string;
  method: string;
  source: string;
  startedAt: number;
  finishedAt?: number;
  status?: number;
  ok?: boolean;
  error?: string;
  bytes?: number;
  postData?: string;
  rpcMethod?: string;
  basket?: string;
  responseBody?: string;
  session?: CDPSession;
};

const pending = new Map<string, NetEntry>();
const finished: NetEntry[] = [];

function netLog(line: string) {
  const row = `[net] ${line}`;
  log(row);
  try {
    appendFileSync(netLogPath, row + '\n');
  } catch {
    // ignore
  }
}

function interesting(url: string) {
  return url.includes('wallet.1sat') || url.includes('messagebox') || url.includes('1sat.app');
}

function parseRpc(postData?: string): { rpcMethod?: string; basket?: string; summary: string } {
  if (!postData) return { summary: '' };
  try {
    const j = JSON.parse(postData) as {
      method?: string;
      id?: unknown;
      params?: unknown[];
    };
    const rpcMethod = j.method;
    let basket: string | undefined;
    const p1 = j.params?.[1] as { basket?: string } | undefined;
    if (p1 && typeof p1.basket === 'string') basket = p1.basket;
    const basketShort = basket ? (basket.length > 16 ? basket.slice(0, 12) + '…' : basket) : '';
    const summary = `rpc=${rpcMethod ?? '?'} id=${j.id ?? '?'} basket=${basketShort || '-'}`;
    return { rpcMethod, basket, summary };
  } catch {
    return { summary: `post=${postData.slice(0, 120)}` };
  }
}

function dumpPending(reason: string) {
  const now = Date.now();
  const list = [...pending.values()].sort((a, b) => a.startedAt - b.startedAt);
  netLog(`PENDING_DUMP reason=${reason} count=${list.length}`);
  for (const e of list) {
    netLog(
      `  PENDING age=${now - e.startedAt}ms id=${e.id} ${e.method} ${e.url} ${parseRpc(e.postData).summary}`,
    );
    if (e.postData) netLog(`    BODY ${e.postData.slice(0, 500)}`);
  }
  // wallet POSTs only, last 25
  const walletDone = finished.filter((e) => e.url.includes('wallet.1sat.app')).slice(-25);
  netLog(`RECENT_WALLET_FINISHED count=${walletDone.length}`);
  for (const e of walletDone) {
    const dur = (e.finishedAt ?? now) - e.startedAt;
    netLog(
      `  FINISHED dur=${dur}ms status=${e.status ?? '-'} ok=${e.ok} ${parseRpc(e.postData).summary} bytes=${e.bytes ?? 0}`,
    );
    if (e.postData) netLog(`    REQ ${e.postData.slice(0, 400)}`);
    if (e.responseBody) netLog(`    RES ${e.responseBody.slice(0, 400)}`);
  }
}

async function attachNetworkOnce(target: Target, source: string, seen: Set<string>): Promise<CDPSession | null> {
  const k2 = `${source}:${target.type()}:${target.url()}`;
  if (seen.has(k2)) return null;
  seen.add(k2);
  try {
    const session = await target.createCDPSession();
    await session.send('Network.enable');
    session.on(
      'Network.requestWillBeSent',
      (p: {
        requestId: string;
        request: { url: string; method: string; postData?: string };
        type?: string;
      }) => {
        const id = `${source}:${p.requestId}`;
        const entry: NetEntry = {
          id,
          cdpId: p.requestId,
          url: p.request.url,
          method: p.request.method,
          source,
          startedAt: Date.now(),
          postData: p.request.postData,
          session,
        };
        const parsed = parseRpc(entry.postData);
        entry.rpcMethod = parsed.rpcMethod;
        entry.basket = parsed.basket;
        pending.set(id, entry);
        if (interesting(entry.url)) {
          netLog(`REQ ${entry.method} ${entry.url} id=${id} ${parsed.summary}`);
          if (entry.postData && entry.url.includes('wallet.1sat')) {
            netLog(`  PAYLOAD ${entry.postData.slice(0, 600)}`);
          }
        }
      },
    );
    session.on('Network.responseReceived', (p: { requestId: string; response: { status: number; url: string } }) => {
      const id = `${source}:${p.requestId}`;
      const e = pending.get(id);
      if (!e) return;
      e.status = p.response.status;
      if (interesting(e.url)) {
        netLog(`RES status=${p.response.status} id=${id} ${parseRpc(e.postData).summary}`);
      }
    });
    session.on('Network.loadingFinished', (p: { requestId: string; encodedDataLength?: number }) => {
      const id = `${source}:${p.requestId}`;
      const e = pending.get(id);
      if (!e) return;
      e.finishedAt = Date.now();
      e.ok = true;
      e.bytes = p.encodedDataLength;
      const finish = async () => {
        if (e.url.includes('wallet.1sat') || e.url.includes('messagebox')) {
          try {
            const body = (await session.send('Network.getResponseBody', {
              requestId: p.requestId,
            })) as { body?: string; base64Encoded?: boolean };
            let text = body.body ?? '';
            if (body.base64Encoded) {
              text = Buffer.from(text, 'base64').toString('utf8');
            }
            e.responseBody = text;
          } catch {
            // body may be unavailable
          }
        }
        finished.push(e);
        pending.delete(id);
        if (interesting(e.url)) {
          netLog(
            `FIN dur=${e.finishedAt! - e.startedAt}ms status=${e.status ?? '-'} bytes=${e.bytes ?? 0} ${parseRpc(e.postData).summary}`,
          );
          if (e.responseBody) netLog(`  RESPONSE ${e.responseBody.slice(0, 500)}`);
        }
      };
      void finish();
    });
    session.on('Network.loadingFailed', (p: { requestId: string; errorText: string; canceled?: boolean }) => {
      const id = `${source}:${p.requestId}`;
      const e = pending.get(id);
      if (!e) return;
      e.finishedAt = Date.now();
      e.ok = false;
      e.error = p.errorText + (p.canceled ? ' (canceled)' : '');
      finished.push(e);
      pending.delete(id);
      netLog(
        `FAIL dur=${e.finishedAt - e.startedAt}ms err=${e.error} ${parseRpc(e.postData).summary} ${e.method} ${e.url}`,
      );
      if (e.postData) netLog(`  PAYLOAD ${e.postData.slice(0, 600)}`);
    });
    netLog(`listening source=${source} target=${target.url()}`);
    return session;
  } catch (err) {
    netLog(`attach failed source=${source}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function getWorker(browser: Browser): Promise<{ worker: WebWorker; target: Target }> {
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
    { timeout: 60_000 },
  );
  const worker = await target.worker();
  if (!worker) throw new Error('no SW worker');
  return { worker, target };
}

function attachSwLogs(w: WebWorker) {
  w.on('console', (m) => {
    const t = m.text();
    if (
      t.includes('[lifecycle]') ||
      t.includes('[storageLock]') ||
      t.includes('[remoteHttp]') ||
      t.includes('[walletSync]') ||
      t.includes('STILL_') ||
      t.includes('teardown') ||
      /error/i.test(t)
    ) {
      log(`[sw] ${t}`);
    }
  });
}

async function unlockIfNeeded(page: Page): Promise<void> {
  try {
    await page.waitForSelector('input[type="password"]', { timeout: 15_000 });
  } catch {
    const snippet = await page.evaluate(() => document.body.innerText.slice(0, 200));
    log(`[test] no password field; UI=${JSON.stringify(snippet)}`);
    return;
  }
  log('[test] unlocking…');
  const hasPw = await page.$('input[type="password"]');
  if (!hasPw) return;
  await hasPw.click({ clickCount: 3 });
  await hasPw.type(secrets.password, { delay: 8 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /unlock/i.test(b.textContent || ''));
    (btn as HTMLButtonElement | undefined)?.click();
  });
  await page
    .waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 30_000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
}

async function sendAction(page: Page, action: string, timeoutMs: number): Promise<unknown> {
  return Promise.race([
    page.evaluate(async (act) => {
      return await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: act }, (r) =>
          resolve({ r, err: chrome.runtime.lastError?.message }),
        );
      });
    }, action),
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true, ms: timeoutMs }), timeoutMs)),
  ]);
}

function isTimeout(b: unknown): boolean {
  return !!(b as { timeout?: boolean })?.timeout;
}
function balOk(b: unknown): boolean {
  const x = b as { timeout?: boolean; r?: { success?: boolean }; err?: string };
  return !!x && !x.timeout && !x.err && x.r?.success === true;
}

async function waitForBalance(page: Page, label: string, maxMs = 30_000): Promise<unknown> {
  const t0 = Date.now();
  let last: unknown;
  while (Date.now() - t0 < maxMs) {
    last = await sendAction(page, 'getBalance', Math.min(BALANCE_TIMEOUT_MS, maxMs - (Date.now() - t0) || 1000));
    if (balOk(last)) {
      log(`[test] ${label} balance ok in ${Date.now() - t0}ms ${JSON.stringify(last)}`);
      return last;
    }
    if (isTimeout(last)) {
      log(`[test] ${label} BALANCE HANG after ${Date.now() - t0}ms`);
      dumpPending(`balance-hang-${label}`);
      return last;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  log(`[test] ${label} give up after ${maxMs}ms ${JSON.stringify(last)}`);
  dumpPending(`balance-giveup-${label}`);
  return last ?? { timeout: true };
}

async function forceLockScreen(page: Page, uiUrl: string) {
  await page.evaluate(async () => {
    await chrome.storage.local.set({ isLocked: true, lastActiveTime: 0 });
    await chrome.storage.session.remove('passKey');
  });
  await page.goto(uiUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 400));
}

async function main() {
  // fresh logs
  try {
    appendFileSync(outLogPath, `\n==== ${new Date().toISOString()} ====\n`);
    appendFileSync(netLogPath, `\n==== ${new Date().toISOString()} ====\n`);
  } catch {
    // ignore
  }

  log('[test] HARD stress + CDP Network (one tab)');
  const browser = await puppeteer.launch({
    headless: false,
    enableExtensions: [extensionPath],
    userDataDir: profileDir,
    args: ['--window-size=420,760', '--no-first-run', '--no-default-browser-check'],
  });

  // Close any leftover about:blank tabs — keep control of page count
  const existing = await browser.pages();
  log(`[test] pages at launch: ${existing.length}`);

  const seen = new Set<string>();
  const { worker, target: swTarget } = await getWorker(browser);
  attachSwLogs(worker);
  await attachNetworkOnce(swTarget, 'sw', seen);

  const extensionId = new URL(worker.url()).hostname;
  let ver = '?';
  try {
    ver = await Promise.race([
      worker.evaluate(() => {
        // @ts-expect-error chrome
        return chrome.runtime.getManifest().version;
      }),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error('version timeout')), 5000)),
    ]);
  } catch (e) {
    log(`[test] version read failed: ${e instanceof Error ? e.message : e}`);
  }
  log(`[test] extensionId=${extensionId} version=${ver}`);

  // Exactly one UI page
  const page = existing[0] && existing[0].url() === 'about:blank' ? existing[0] : await browser.newPage();
  for (const p of await browser.pages()) {
    if (p !== page) {
      try {
        await p.close();
      } catch {
        // ignore
      }
    }
  }
  await attachNetworkOnce(page.target(), 'page', seen);
  page.on('console', (m) => {
    if (m.type() === 'error') log(`[ui:error] ${m.text()}`);
  });
  await page.setViewport({ width: 400, height: 700 });
  const uiUrl = `chrome-extension://${extensionId}/index.html`;
  log(`[test] goto ${uiUrl}`);
  await page.goto(uiUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 1000));
  log(`[test] pages now: ${(await browser.pages()).length}`);

  let ready = await sendAction(page, 'getBalance', 5_000);
  if (!balOk(ready)) {
    await forceLockScreen(page, uiUrl);
    await unlockIfNeeded(page);
    ready = await waitForBalance(page, 'baseline', 35_000);
  }
  if (!balOk(ready)) {
    log('[test] no baseline — abort');
    dumpPending('no-baseline');
    await browser.close();
    process.exit(1);
  }

  const results: Array<{ cycle: number; mode: string; ok: boolean }> = [];

  for (let i = 1; i <= CYCLES; i++) {
    const mode =
      i % 5 === 1
        ? 'lock-during-sync'
        : i % 5 === 2
          ? 'rapid'
          : i % 5 === 3
            ? 'bal-then-lock'
            : i % 5 === 4
              ? 'triple-lock-unlock'
              : 'normal';
    log(`\n[test] === cycle ${i}/${CYCLES} mode=${mode} pages=${(await browser.pages()).length} ===`);

    try {
      if (mode === 'bal-then-lock') {
        void sendAction(page, 'getBalance', BALANCE_TIMEOUT_MS);
        void sendAction(page, 'getBalance', BALANCE_TIMEOUT_MS);
        await new Promise((r) => setTimeout(r, 30));
      }

      if (mode === 'lock-during-sync') {
        const lock1 = await sendAction(page, 'WALLET_LOCKED', LOCK_TIMEOUT_MS);
        log(`[test] pre-lock ${JSON.stringify(lock1)}`);
        if (isTimeout(lock1)) {
          dumpPending('pre-lock-hang');
          results.push({ cycle: i, mode, ok: false });
          break;
        }
        await forceLockScreen(page, uiUrl);
        await unlockIfNeeded(page);
        await new Promise((r) => setTimeout(r, 80));
        const lock2 = await sendAction(page, 'WALLET_LOCKED', LOCK_TIMEOUT_MS);
        log(`[test] mid-sync lock ${JSON.stringify(lock2)}`);
        if (isTimeout(lock2)) {
          log('[test] LOCK HANG mid-sync');
          dumpPending('lock-hang-mid-sync');
          results.push({ cycle: i, mode, ok: false });
          break;
        }
        await forceLockScreen(page, uiUrl);
        await unlockIfNeeded(page);
        const bal = await waitForBalance(page, `cycle${i}`, 35_000);
        const ok = balOk(bal);
        results.push({ cycle: i, mode, ok });
        if (!ok) break;
        continue;
      }

      if (mode === 'triple-lock-unlock') {
        for (let j = 0; j < 3; j++) {
          const lk = await sendAction(page, 'WALLET_LOCKED', LOCK_TIMEOUT_MS);
          if (isTimeout(lk)) {
            log(`[test] LOCK HANG triple ${j}`);
            dumpPending(`lock-hang-triple-${j}`);
            results.push({ cycle: i, mode, ok: false });
            throw new Error('lock hang');
          }
          await forceLockScreen(page, uiUrl);
          await unlockIfNeeded(page);
          if (j < 2) await new Promise((r) => setTimeout(r, 50));
        }
        const bal = await waitForBalance(page, `cycle${i}`, 35_000);
        const ok = balOk(bal);
        results.push({ cycle: i, mode, ok });
        if (!ok) break;
        continue;
      }

      const lock = await sendAction(page, 'WALLET_LOCKED', LOCK_TIMEOUT_MS);
      log(`[test] lock ${JSON.stringify(lock)}`);
      if (isTimeout(lock)) {
        log('[test] LOCK HANG');
        dumpPending('lock-hang');
        results.push({ cycle: i, mode, ok: false });
        break;
      }

      await forceLockScreen(page, uiUrl);
      await unlockIfNeeded(page);

      if (mode === 'rapid') {
        const spam = await Promise.all([
          sendAction(page, 'getBalance', BALANCE_TIMEOUT_MS),
          sendAction(page, 'getBalance', BALANCE_TIMEOUT_MS),
          sendAction(page, 'getBalance', BALANCE_TIMEOUT_MS),
        ]);
        if (spam.every(isTimeout)) {
          log('[test] all balances HANG');
          dumpPending('rapid-balance-hang');
          results.push({ cycle: i, mode, ok: false });
          break;
        }
      }

      if (mode === 'normal') await new Promise((r) => setTimeout(r, 500));
      const bal = await waitForBalance(page, `cycle${i}`, 35_000);
      const ok = balOk(bal);
      results.push({ cycle: i, mode, ok });
      if (!ok) break;
    } catch (e) {
      if ((e as Error).message === 'lock hang') break;
      log(`[test] cycle error ${e}`);
      dumpPending('cycle-error');
      results.push({ cycle: i, mode, ok: false });
      break;
    }
  }

  dumpPending('end-of-run');
  const passed = results.filter((r) => r.ok).length;
  log(`[test] HARD SUMMARY ${JSON.stringify({ passed, attempted: results.length, target: CYCLES, results })}`);
  log(`[test] net log: ${netLogPath}`);
  await browser.close();
  process.exit(passed === CYCLES ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
