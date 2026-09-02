/**
 * E2E test for the isolated prompt.html flow.
 *
 * Prereq: 1sat-name frontend dev server on http://localhost:5173
 *   cd ../1sat-name/frontend && npm run dev
 *
 * Run: bun scripts/test-prompt-flow.ts
 *
 * Flow: create/unlock debug wallet → click CONNECT on the dApp → expect a
 * prompt.html window with the grouped permission UI → Allow Selected →
 * window closes, no request keys in chrome.storage.local, main popup clean,
 * dApp reconnect does not re-prompt.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import puppeteer, { type Browser, type Page, type WebWorker } from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const extensionPath = resolve(root, 'build');
const profileDir = resolve(root, '.puppeteer-profile');
const secretsPath = resolve(root, '.debug-wallet.json');

const DAPP_URL = 'http://localhost:5173';
const PASSWORD = 'testwallet1';
const ACCOUNT_NAME = 'debug';

type Secrets = {
  password: string;
  accountName: string;
  extensionId?: string;
  seed?: string;
  createdAt?: string;
};

function loadSecrets(): Secrets {
  if (existsSync(secretsPath)) return JSON.parse(readFileSync(secretsPath, 'utf8')) as Secrets;
  return { password: PASSWORD, accountName: ACCOUNT_NAME };
}

function saveSecrets(s: Secrets) {
  writeFileSync(secretsPath, JSON.stringify(s, null, 2) + '\n');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getServiceWorker(browser: Browser): Promise<WebWorker> {
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
    { timeout: 30_000 },
  );
  const worker = await target.worker();
  if (!worker) throw new Error('Service worker target has no worker handle');
  return worker;
}

async function openExtensionUi(browser: Browser, extensionId: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 700 });
  page.on('console', (msg) => console.log(`[ui:${msg.type()}]`, msg.text()));
  await page.goto(`chrome-extension://${extensionId}/index.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await sleep(1500);
  return page;
}

async function hasWalletUi(page: Page): Promise<boolean> {
  const text = await page.evaluate(() => document.body.innerText);
  if (text.includes('Create New Wallet')) return false;
  if (text.includes('Create password')) return false;
  return true;
}

async function createWallet(page: Page, secrets: Secrets): Promise<Secrets> {
  console.log('[ui] creating wallet…');
  await page.waitForFunction(() => document.body.innerText.includes('Create New Wallet'), { timeout: 20_000 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Create New Wallet'));
    if (!btn) throw new Error('Create New Wallet button not found');
    (btn as HTMLButtonElement).click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Create password'), { timeout: 15_000 });
  const inputs = await page.$$('input');
  if (inputs.length < 4) throw new Error(`Expected ≥4 inputs on create form, found ${inputs.length}`);
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type(secrets.accountName, { delay: 15 });
  await inputs[2].click({ clickCount: 3 });
  await inputs[2].type(secrets.password, { delay: 15 });
  await inputs[3].click({ clickCount: 3 });
  await inputs[3].type(secrets.password, { delay: 15 });

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Generate Seed'));
    if (!btn) throw new Error('Generate Seed button not found');
    (btn as HTMLButtonElement).click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Your recovery phrase'), { timeout: 90_000 });
  await sleep(500);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Next');
    if (!btn) throw new Error('Next button not found');
    (btn as HTMLButtonElement).click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Wallet Ready'), { timeout: 20_000 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Enter');
    if (!btn) throw new Error('Enter button not found');
    (btn as HTMLButtonElement).click();
  });
  await sleep(2000);
  secrets.createdAt = new Date().toISOString();
  return secrets;
}

async function storageKeys(worker: WebWorker): Promise<string[]> {
  return worker.evaluate(async () => {
    // @ts-expect-error chrome in SW
    const local = await chrome.storage.local.get(null);
    return Object.keys(local);
  });
}

function fail(msg: string): never {
  console.error(`\n❌ FAIL: ${msg}`);
  process.exit(1);
}

async function launchBrowser(): Promise<{ browser: Browser; worker: WebWorker }> {
  // Extension loading is occasionally flaky on first launch; retry once.
  for (let attempt = 0; ; attempt++) {
    const browser = await puppeteer.launch({
      headless: false,
      enableExtensions: [extensionPath],
      userDataDir: profileDir,
      defaultViewport: null,
      args: ['--window-size=420,760', '--no-first-run', '--no-default-browser-check'],
    });
    browser.on('targetcreated', (t) => console.log('[target+]', t.type(), t.url()));
    browser.on('targetdestroyed', (t) => console.log('[target-]', t.type(), t.url()));
    try {
      const worker = await getServiceWorker(browser);
      return { browser, worker };
    } catch (err) {
      await browser.close().catch(() => {});
      if (attempt >= 2) throw err;
      console.log('[harness] extension SW did not start; retrying launch…');
      await sleep(2000);
    }
  }
}

async function main() {
  let secrets = loadSecrets();
  let launched = await launchBrowser();
  let browser = launched.browser;

  try {
    const worker = launched.worker;
    worker.on('console', (msg) => console.log(`[sw:${msg.type()}]`, msg.text()));
    const extensionId = new URL(worker.url()).hostname;
    secrets.extensionId = extensionId;
    saveSecrets(secrets);

    const uiPage = await openExtensionUi(browser, extensionId);
    if (!(await hasWalletUi(uiPage))) {
      secrets = await createWallet(uiPage, secrets);
      saveSecrets(secrets);
    } else {
      const bodyText = await uiPage.evaluate(() => document.body.innerText);
      if (bodyText.includes('Welcome back')) {
        console.log('[ui] wallet locked — unlocking');
        const inputs = await uiPage.$$('input');
        await inputs[0].type(secrets.password, { delay: 15 });
        await uiPage.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Unlock');
          if (!btn) throw new Error('Unlock button not found');
          (btn as HTMLButtonElement).click();
        });
        await uiPage.waitForFunction(() => !document.body.innerText.includes('Welcome back'), { timeout: 30_000 });
        await sleep(2000);
        console.log('[ui] unlocked');
      }
    }
    // Revoke any permissions granted to the dApp by previous runs so the
    // grouped permission prompt fires again.
    await uiPage.evaluate(async () => {
      await new Promise((r) =>
        chrome.runtime.sendMessage({ action: 'PERMISSIONS_REVOKE_ALL', originator: 'localhost:5173' }, r),
      );
    });
    console.log('[ui] revoked localhost:5173 permissions');
    // Let post-unlock sync settle so the SW can answer the dApp's substrate ping.
    await sleep(10_000);

    // Close the wallet tab so no 'extension-popup' port is connected while we
    // drive the dApp flow (mirrors real browser-action-closed conditions).
    await uiPage.close();
    await sleep(500);

    console.log('[dapp] opening', DAPP_URL);
    const dapp = await browser.newPage();
    dapp.on('console', (msg) => console.log(`[dapp:${msg.type()}]`, msg.text()));
    dapp.on('pageerror', (e) => console.log('[dapp:pageerror]', String(e.stack).split('\n').slice(0, 4).join(' | ')));
    await dapp.goto(DAPP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await dapp.evaluate(() => localStorage.clear());
    await dapp.reload({ waitUntil: 'domcontentloaded' });
    await dapp
      .waitForFunction(() => document.body.innerText.includes('CONNECT'), { timeout: 120_000 })
      .catch(async () => {
        const text = await dapp.evaluate(() => document.body.innerText);
        console.log('[dapp] CONNECT never appeared; body text:\n' + text.slice(0, 500));
        fail('CONNECT button never appeared');
      });
    await dapp.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'CONNECT');
      if (!btn) throw new Error('CONNECT button not found');
      (btn as HTMLButtonElement).click();
    });
    console.log('[dapp] CONNECT clicked');

    const promptTarget = await browser.waitForTarget((t) => t.type() === 'page' && t.url().includes('prompt.html'), {
      timeout: 30_000,
    });
    const promptPage = (await promptTarget.page())!;
    promptPage.on('console', (msg) => console.log(`[prompt:${msg.type()}]`, msg.text()));
    promptPage.on('pageerror', (err) => console.log('[prompt:pageerror]', err.stack || err.message));
    promptPage.on('close', () => console.log('[prompt] page closed'));
    console.log('[prompt] window opened:', promptTarget.url());

    await promptPage.waitForFunction(() => document.body.innerText.includes('Allow Selected'), { timeout: 30_000 });
    console.log('[prompt] grouped permission UI rendered');

    const keysDuringPrompt = await storageKeys(worker);
    if (keysDuringPrompt.some((k) => k.endsWith('PermissionRequest') || k === 'sendMNEERequest')) {
      fail(`request keys present in chrome.storage.local during prompt: ${keysDuringPrompt.join(', ')}`);
    }

    await promptPage.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Allow Selected'));
      if (!btn) throw new Error('Allow Selected button not found');
      (btn as HTMLButtonElement).click();
    });
    console.log('[prompt] Allow Selected clicked');

    const closedDeadline = Date.now() + 15_000;
    while (Date.now() < closedDeadline) {
      if (!browser.targets().some((t) => t.type() === 'page' && t.url().includes('prompt.html'))) break;
      await sleep(250);
    }
    if (browser.targets().some((t) => t.type() === 'page' && t.url().includes('prompt.html'))) {
      fail('prompt window did not close after Allow Selected');
    }
    console.log('[prompt] window closed');

    const keysAfter = await storageKeys(worker);
    if (keysAfter.some((k) => k.endsWith('PermissionRequest') || k === 'sendMNEERequest')) {
      fail(`request keys left in chrome.storage.local after response: ${keysAfter.join(', ')}`);
    }
    console.log('[sw] storage clean after response');

    const main = await openExtensionUi(browser, extensionId);
    const mainText = await main.evaluate(() => document.body.innerText);
    if (mainText.includes('Permission Request')) fail('main popup shows a permission pane');
    if (!mainText.includes('Coins') && !mainText.includes('Receive')) {
      fail(`main popup does not show wallet UI: ${mainText.slice(0, 200)}`);
    }
    console.log('[ui] main popup clean (wallet UI, no request panes)');
    await main.close();

    await dapp.reload({ waitUntil: 'domcontentloaded' });
    await sleep(5000);
    if (browser.targets().some((t) => t.type() === 'page' && t.url().includes('prompt.html'))) {
      fail('dApp reconnect raised a prompt window');
    }
    console.log('[dapp] reconnect did not re-prompt');

    console.log('\n✅ E2E PASS (live flow)');

    // The original bug: a browser/SW restart left a stuck prompt behind.
    // Full restart is deterministic (runtime.reload is flaky for CLI-loaded
    // extensions): relaunch and assert the main popup is clean.
    await browser.close().catch(() => {});
    launched = await launchBrowser();
    browser = launched.browser;
    const keysPostRestart = await storageKeys(launched.worker);
    if (keysPostRestart.some((k) => k.endsWith('PermissionRequest') || k === 'sendMNEERequest')) {
      fail(`request keys present after browser restart: ${keysPostRestart.join(', ')}`);
    }
    const afterRestart = await openExtensionUi(browser, extensionId);
    const restartText = await afterRestart.evaluate(() => document.body.innerText);
    if (restartText.includes('Permission Request')) fail('main popup stuck on a prompt after restart');
    console.log('[ui] main popup clean after browser restart');

    console.log('\n✅ E2E PASS');
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
