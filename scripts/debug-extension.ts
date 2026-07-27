/**
 * Official Puppeteer + Chrome for Testing harness for yours-wallet.
 *
 *   bun run debug:ext              # launch, open UI, keep browser open
 *   bun run debug:ext -- --create  # also create a wallet if none exists
 *   bun run debug:ext -- --reload  # chrome.runtime.reload() then re-attach
 *
 * Profile (persists keys): .puppeteer-profile/
 * Secrets (gitignored):    .debug-wallet.json
 *
 * Docs: https://pptr.dev/guides/chrome-extensions
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

const PASSWORD = 'testwallet1';
const ACCOUNT_NAME = 'debug';

const args = new Set(process.argv.slice(2));
const wantCreate = args.has('--create');
const wantReload = args.has('--reload');
const headed = !args.has('--headless');

type Secrets = {
  password: string;
  accountName: string;
  extensionId?: string;
  seed?: string;
  createdAt?: string;
};

function loadSecrets(): Secrets {
  if (existsSync(secretsPath)) {
    return JSON.parse(readFileSync(secretsPath, 'utf8')) as Secrets;
  }
  return { password: PASSWORD, accountName: ACCOUNT_NAME };
}

function saveSecrets(s: Secrets) {
  writeFileSync(secretsPath, JSON.stringify(s, null, 2) + '\n');
}

async function getServiceWorker(browser: Browser): Promise<WebWorker> {
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
    { timeout: 30_000 },
  );
  const worker = await target.worker();
  if (!worker) throw new Error('Service worker target has no worker handle');
  return worker;
}

function extensionIdFromWorker(worker: WebWorker): string {
  return new URL(worker.url()).hostname;
}

async function openExtensionUi(browser: Browser, extensionId: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 700 });
  page.on('console', (msg) => {
    console.log(`[ui:${msg.type()}]`, msg.text());
  });
  await page.goto(`chrome-extension://${extensionId}/index.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await new Promise((r) => setTimeout(r, 1500));
  return page;
}

/** Best-effort popup open via chrome.action (may no-op if no user gesture in some CfT builds). */
async function tryOpenPopup(worker: WebWorker): Promise<void> {
  try {
    await worker.evaluate(async () => {
      // @ts-expect-error chrome in SW
      if (chrome?.action?.openPopup) await chrome.action.openPopup();
    });
  } catch {
    // Fallback is full-tab UI via openExtensionUi
  }
}

async function dumpSwState(worker: WebWorker): Promise<void> {
  const info = await worker.evaluate(async () => {
    // @ts-expect-error chrome in SW
    const manifest = chrome.runtime.getManifest();
    // @ts-expect-error chrome in SW
    const storageLocal = await chrome.storage.local.get(null);
    const keys = Object.keys(storageLocal);
    return {
      manifestVersion: manifest.version,
      storageKeyCount: keys.length,
      storageKeys: keys.slice(0, 40),
    };
  });
  console.log('[sw] state', info);
}

async function hasWalletUi(page: Page): Promise<boolean> {
  const text = await page.evaluate(() => document.body.innerText);
  if (text.includes('Create New Wallet')) return false;
  if (text.includes('Create password')) return false;
  return true;
}

async function createWallet(page: Page, secrets: Secrets): Promise<Secrets> {
  console.log('[ui] creating wallet…');
  await page.waitForFunction(() => document.body.innerText.includes('Create New Wallet'), {
    timeout: 20_000,
  });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Create New Wallet'),
    );
    if (!btn) throw new Error('Create New Wallet button not found');
    (btn as HTMLButtonElement).click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Create password'), {
    timeout: 15_000,
  });

  const inputs = await page.$$('input');
  if (inputs.length < 4) {
    throw new Error(`Expected ≥4 inputs on create form, found ${inputs.length}`);
  }
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type(secrets.accountName, { delay: 15 });
  await inputs[2].click({ clickCount: 3 });
  await inputs[2].type(secrets.password, { delay: 15 });
  await inputs[3].click({ clickCount: 3 });
  await inputs[3].type(secrets.password, { delay: 15 });

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Generate Seed'),
    );
    if (!btn) throw new Error('Generate Seed button not found');
    (btn as HTMLButtonElement).click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Your recovery phrase'), {
    timeout: 90_000,
  });
  await new Promise((r) => setTimeout(r, 500));

  const seed = await page.evaluate(() => {
    const body = document.body.innerText;
    const match = body.match(/Your recovery phrase[\s\S]*?Copy to clipboard/);
    if (!match) return null;
    const chunk = match[0]
      .replace('Your recovery phrase', '')
      .replace('Safely write down and store your seed phrase in a safe place.', '')
      .replace('Copy to clipboard', '');
    const tokens = chunk
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t && !/^\d+$/.test(t) && t.length > 1);
    return tokens.slice(0, 12).join(' ');
  });

  if (seed && seed.split(' ').length >= 12) {
    secrets.seed = seed;
    console.log('[ui] seed captured → .debug-wallet.json');
  } else {
    console.warn('[ui] could not parse seed from DOM; complete backup manually if needed');
  }

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Next');
    if (!btn) throw new Error('Next button not found');
    (btn as HTMLButtonElement).click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Wallet Ready'), {
    timeout: 20_000,
  });

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Enter');
    if (!btn) throw new Error('Enter button not found');
    (btn as HTMLButtonElement).click();
  });

  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));

  secrets.createdAt = new Date().toISOString();
  return secrets;
}

async function main() {
  if (!existsSync(resolve(extensionPath, 'manifest.json'))) {
    console.error(`No built extension at ${extensionPath}. Run: bun run build`);
    process.exit(1);
  }

  mkdirSync(profileDir, { recursive: true });
  let secrets = loadSecrets();

  const browserExe = await Promise.resolve(puppeteer.executablePath());
  console.log('Launching Chrome for Testing via Puppeteer…');
  console.log(`  extension: ${extensionPath}`);
  console.log(`  profile:   ${profileDir}`);
  console.log(`  browser:   ${browserExe}`);

  const browser = await puppeteer.launch({
    headless: headed ? false : true,
    // Official extension loading (CfT). Do not point at system Google Chrome.
    enableExtensions: [extensionPath],
    userDataDir: profileDir,
    defaultViewport: null,
    args: ['--window-size=420,760', '--no-first-run', '--no-default-browser-check'],
  });

  try {
    const worker = await getServiceWorker(browser);
    worker.on('console', (msg) => {
      console.log(`[sw:${msg.type()}]`, msg.text());
    });

    const extensionId = extensionIdFromWorker(worker);
    secrets.extensionId = extensionId;
    saveSecrets(secrets);

    console.log(`  extensionId: ${extensionId}`);
    await dumpSwState(worker);
    await tryOpenPopup(worker);

    if (wantReload) {
      console.log('[sw] chrome.runtime.reload()…');
      // reload tears down the worker; fire-and-forget
      worker.evaluate(() => {
        // @ts-expect-error chrome in SW
        chrome.runtime.reload();
      }).catch(() => {});
      const worker2 = await getServiceWorker(browser);
      worker2.on('console', (msg) => console.log(`[sw:${msg.type()}]`, msg.text()));
      await dumpSwState(worker2);
    }

    const page = await openExtensionUi(browser, extensionId);
    const existing = await hasWalletUi(page);
    console.log(`  wallet UI present: ${existing}`);

    if (wantCreate && !existing) {
      secrets = await createWallet(page, secrets);
      saveSecrets(secrets);
      console.log('[ui] wallet created');
      console.log(`  password: ${secrets.password}`);
      if (secrets.seed) console.log(`  seed: ${secrets.seed}`);
    } else if (wantCreate && existing) {
      console.log('[ui] wallet already in profile; skip --create');
      console.log(`  password: ${secrets.password}`);
    }

    console.log('\nReady. Profile + keys persist across runs.');
    console.log('Ctrl+C to quit browser (data stays on disk).');

    await new Promise<void>((resolveDone) => {
      process.on('SIGINT', () => resolveDone());
      process.on('SIGTERM', () => resolveDone());
    });
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
