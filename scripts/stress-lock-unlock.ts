/**
 * Stress lock→unlock in one SW lifetime; probe getBalance after each unlock.
 * Single browser tab only — no tab spam.
 *   bun run scripts/stress-lock-unlock.ts
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import puppeteer, { type Browser, type Page, type WebWorker } from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const extensionPath = resolve(root, 'build');
const profileDir = resolve(root, '.puppeteer-profile');
const secretsPath = resolve(root, '.debug-wallet.json');
const CYCLES = 5;
const BALANCE_TIMEOUT_MS = 20_000;

const secrets = existsSync(secretsPath)
  ? (JSON.parse(readFileSync(secretsPath, 'utf8')) as { password: string })
  : { password: 'testwallet1' };

async function getWorker(browser: Browser): Promise<WebWorker> {
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
    { timeout: 60_000 },
  );
  const w = await target.worker();
  if (!w) throw new Error('no SW worker');
  return w;
}

async function unlockIfNeeded(page: Page): Promise<void> {
  const hasPw = await page.$('input[type="password"]');
  if (!hasPw) {
    console.log('[test] no password field — treating as unlocked');
    return;
  }
  console.log('[test] unlocking…');
  await hasPw.click({ clickCount: 3 });
  await hasPw.type(secrets.password, { delay: 15 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /unlock/i.test(b.textContent || ''));
    btn?.click();
  });
  await page
    .waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 30_000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));
}

async function sendAction(page: Page, action: string, timeoutMs = 25_000): Promise<unknown> {
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

async function main() {
  console.log('[test] launch CfT (one window)…');
  const browser = await puppeteer.launch({
    headless: false,
    enableExtensions: [extensionPath],
    userDataDir: profileDir,
    args: ['--window-size=420,760', '--no-first-run', '--no-default-browser-check'],
  });

  const attachSwLogs = (w: WebWorker) => {
    w.on('console', (m) => {
      const t = m.text();
      if (
        t.includes('[lifecycle]') ||
        t.includes('[storageLock]') ||
        t.includes('[monitor]') ||
        t.includes('[walletSync]') ||
        t.includes('Task') ||
        t.includes('teardown') ||
        t.includes('Wallet locked') ||
        /error/i.test(t)
      ) {
        console.log(`[sw]`, t);
      }
    });
  };

  let worker = await getWorker(browser);
  attachSwLogs(worker);

  const extensionId = new URL(worker.url()).hostname;
  const ver = await worker.evaluate(() => {
    // @ts-expect-error chrome
    return chrome.runtime.getManifest().version;
  });
  console.log('[test] extensionId', extensionId, 'version', ver);
  if (ver === '5.0.1') {
    console.warn('[test] STALE SW version 5.0.1 — rebuild/bump may not have loaded');
  }

  // Exactly one page for the whole run — retry if reload briefly blocks extension pages
  let page: Page | undefined;
  const uiUrl = `chrome-extension://${extensionId}/index.html`;
  for (let i = 0; i < 6; i++) {
    try {
      page = await browser.newPage();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!page) throw new Error('no page');
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[ui:error]`, m.text());
  });
  await page.setViewport({ width: 400, height: 700 });
  for (let i = 0; i < 8; i++) {
    try {
      await page.goto(uiUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      break;
    } catch (e) {
      console.warn(`[test] goto attempt ${i + 1}:`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  await new Promise((r) => setTimeout(r, 1500));

  // Cold start often has UI "unlocked" look without session passKey — force lock screen.
  const baselineProbe = await sendAction(page, 'getBalance', 8_000);
  if (!(baselineProbe as { r?: { success?: boolean } })?.r?.success) {
    console.log('[test] no live wallet on start — forcing unlock screen');
    await page.evaluate(async () => {
      await chrome.storage.local.set({ isLocked: true, lastActiveTime: 0 });
      await chrome.storage.session.remove('passKey');
    });
    await page.goto(uiUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1000));
  }
  await unlockIfNeeded(page);
  // Wait for become-live sync to finish before first probe
  await new Promise((r) => setTimeout(r, 5000));

  const baselineBal = await sendAction(page, 'getBalance', BALANCE_TIMEOUT_MS);
  const baselineAddr = await sendAction(page, 'getReceiveAddress', 10_000);
  console.log('[test] baseline balance', baselineBal);
  console.log('[test] baseline addr', baselineAddr);

  const results: Array<{ cycle: number; lock: unknown; bal: unknown }> = [];

  for (let i = 1; i <= CYCLES; i++) {
    console.log(`\n[test] === cycle ${i}/${CYCLES} ===`);
    const lock = await sendAction(page, 'WALLET_LOCKED', 30_000);
    console.log('[test] lock', lock);

    // Same tab: force unlock screen without new pages
    await page.evaluate(async () => {
      await chrome.storage.local.set({ isLocked: true, lastActiveTime: 0 });
      await chrome.storage.session.remove('passKey');
    });
    await page.goto(uiUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1000));
    await unlockIfNeeded(page);

    // WALLET_UNLOCKED is sent by Unlock UI; unlockIfNeeded already did password submit.
    // Give SW reinit a moment, then probe.
    await new Promise((r) => setTimeout(r, 2000));
    const bal = await sendAction(page, 'getBalance', BALANCE_TIMEOUT_MS);
    console.log('[test] balance', bal);
    results.push({ cycle: i, lock, bal });

    const ok =
      bal &&
      typeof bal === 'object' &&
      !(bal as { timeout?: boolean }).timeout &&
      (bal as { r?: { success?: boolean } }).r?.success === true;
    if (!ok) {
      console.error(`[test] FAIL cycle ${i}`);
      break;
    }
  }

  const passed = results.filter((r) => {
    const b = r.bal as { timeout?: boolean; r?: { success?: boolean } };
    return b && !b.timeout && b.r?.success === true;
  }).length;

  console.log('\n[test] SUMMARY', { passed, attempted: results.length, results });
  await browser.close();
  process.exit(passed === CYCLES ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
