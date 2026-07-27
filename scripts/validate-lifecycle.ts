/**
 * Validate holistic wallet present/absent lifecycle (not AuthFetch multi-cycle soak).
 *   bun run scripts/validate-lifecycle.ts
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import puppeteer, { type Browser, type Page, type WebWorker } from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const extensionPath = resolve(root, 'build');
const profileDir = resolve(root, '.puppeteer-profile');
const secretsPath = resolve(root, '.debug-wallet.json');
const secrets = existsSync(secretsPath)
  ? (JSON.parse(readFileSync(secretsPath, 'utf8')) as { password: string; receiveAddress?: string })
  : { password: 'testwallet1' };

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(ok ? `PASS  ${name}` : `FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function getWorker(browser: Browser): Promise<WebWorker> {
  const t = await browser.waitForTarget(
    (x) => x.type() === 'service_worker' && x.url().endsWith('/background.js'),
    { timeout: 60_000 },
  );
  const w = await t.worker();
  if (!w) throw new Error('no SW');
  return w;
}

async function msg(page: Page, action: string, timeoutMs = 15_000): Promise<unknown> {
  return Promise.race([
    page.evaluate(
      (act) =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: act }, (r) =>
            resolve({ r, err: chrome.runtime.lastError?.message }),
          );
        }),
      action,
    ),
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true, ms: timeoutMs }), timeoutMs)),
  ]);
}

async function unlock(page: Page) {
  await page.waitForSelector('input[type="password"]', { timeout: 15_000 });
  const el = await page.$('input[type="password"]');
  if (!el) throw new Error('no password field');
  await el.click({ clickCount: 3 });
  await el.type(secrets.password, { delay: 8 });
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => /unlock/i.test(b.textContent || ''))
      ?.click();
  });
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2500));
}

async function forceLockUi(page: Page, uiUrl: string) {
  // SW must drop wallet — storage flags alone are not enough.
  await msg(page, 'WALLET_LOCKED', 15_000);
  await page.evaluate(async () => {
    await chrome.storage.local.set({ isLocked: true, lastActiveTime: 0 });
    await chrome.storage.session.remove('passKey');
  });
  await page.goto(uiUrl, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 800));
}

async function main() {
  console.log('[validate] launch…');
  const browser = await puppeteer.launch({
    headless: false,
    enableExtensions: [extensionPath],
    userDataDir: profileDir,
    args: ['--window-size=420,760', '--no-first-run', '--no-default-browser-check'],
  });
  const worker = await getWorker(browser);
  worker.on('console', (m) => {
    const t = m.text();
    if (t.includes('[lifecycle]') || t.includes('drop') || t.includes('create')) console.log('[sw]', t);
  });
  const extensionId = new URL(worker.url()).hostname;
  const ver = await worker.evaluate(() => chrome.runtime.getManifest().version);
  console.log('[validate] id', extensionId, 'ver', ver);
  check('manifest 5.0.5+', ver >= '5.0.5', ver);

  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());
  for (const p of await browser.pages()) {
    if (p !== page) await p.close().catch(() => {});
  }
  await page.setViewport({ width: 400, height: 700 });
  const uiUrl = `chrome-extension://${extensionId}/index.html`;
  await page.goto(uiUrl, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1000));

  // --- Locked: no wallet ---
  await forceLockUi(page, uiUrl);
  const tLock0 = Date.now();
  const lockedBal = (await msg(page, 'getBalance', 8_000)) as {
    timeout?: boolean;
    r?: { success?: boolean; error?: string };
  };
  const lockedMs = Date.now() - tLock0;
  check(
    'locked getBalance fails fast (not hang)',
    !lockedBal.timeout && lockedBal.r?.success === false && lockedMs < 3000,
    JSON.stringify({ lockedMs, lockedBal }),
  );
  check(
    'locked getBalance says not available',
    !!lockedBal.r?.error?.match(/not available|not initialized|Wallet/i),
    lockedBal.r?.error,
  );

  const lockedAddr = (await msg(page, 'getReceiveAddress', 8_000)) as {
    timeout?: boolean;
    r?: { success?: boolean };
  };
  check(
    'locked getReceiveAddress fails fast',
    !lockedAddr.timeout && lockedAddr.r?.success === false,
    JSON.stringify(lockedAddr),
  );

  // --- Unlock: wallet live ---
  await unlock(page);
  const bal = (await msg(page, 'getBalance', 20_000)) as {
    timeout?: boolean;
    r?: { success?: boolean; data?: number };
  };
  check('unlocked getBalance ok', !bal.timeout && bal.r?.success === true && typeof bal.r.data === 'number', JSON.stringify(bal));

  const addr = (await msg(page, 'getReceiveAddress', 10_000)) as {
    timeout?: boolean;
    r?: { success?: boolean; data?: string };
  };
  check(
    'unlocked getReceiveAddress ok',
    !addr.timeout && addr.r?.success === true && typeof addr.r.data === 'string' && addr.r.data.startsWith('1'),
    JSON.stringify(addr),
  );
  if (secrets.receiveAddress) {
    check('receive address matches debug wallet', addr.r?.data === secrets.receiveAddress, `${addr.r?.data} vs ${secrets.receiveAddress}`);
  }

  // CWI getPublicKey via extension page (identity)
  const pub = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getPublicKey', params: { identityKey: true }, originator: chrome.runtime.id },
        (r) => resolve({ r, err: chrome.runtime.lastError?.message }),
      );
    });
  });
  const pubOk =
    pub &&
    typeof pub === 'object' &&
    !(pub as { err?: string }).err &&
    ((pub as { r?: { publicKey?: string; success?: boolean } }).r?.publicKey ||
      (pub as { r?: { success?: boolean } }).r?.success !== false);
  check('unlocked getPublicKey responds', !!pubOk, JSON.stringify(pub).slice(0, 200));

  // --- Lock again: gone ---
  const lockResp = (await msg(page, 'WALLET_LOCKED', 20_000)) as {
    timeout?: boolean;
    r?: { success?: boolean };
  };
  check('WALLET_LOCKED succeeds', !lockResp.timeout && lockResp.r?.success === true, JSON.stringify(lockResp));

  const tAfter = Date.now();
  const afterLockBal = (await msg(page, 'getBalance', 8_000)) as {
    timeout?: boolean;
    r?: { success?: boolean };
  };
  check(
    'after lock getBalance fails fast',
    !afterLockBal.timeout && afterLockBal.r?.success === false && Date.now() - tAfter < 3000,
    JSON.stringify(afterLockBal),
  );

  // --- Unlock once more ---
  await forceLockUi(page, uiUrl);
  await unlock(page);
  const bal2 = (await msg(page, 'getBalance', 20_000)) as {
    timeout?: boolean;
    r?: { success?: boolean; data?: number };
  };
  check(
    'second unlock getBalance ok',
    !bal2.timeout && bal2.r?.success === true,
    JSON.stringify(bal2),
  );

  const passed = results.filter((r) => r.ok).length;
  console.log('\n[validate] SUMMARY', { passed, total: results.length, results });
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
