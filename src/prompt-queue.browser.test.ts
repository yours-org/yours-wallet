import { afterAll, beforeAll, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { build, type Plugin } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer';

// Actual production React/request pages, isolated from the extension service
// worker and hardware. This is a UI regression, not a native-wallet qualification.
const root = path.resolve(import.meta.dir, '..');
const source = path.join(root, 'src');
const mocked = new Map(
  [
    ['utils/constants', 'export const HOSTED_YOURS_IMAGE="unused-local-fixture";'],
    [
      'hooks/useTheme',
      'export const useTheme=()=>({theme:{color:{global:{contrast:"#fff",gray:"#888",row:"#111",walletBackground:"#000"}}}});',
    ],
    ['hooks/useBottomMenu', 'const fn=()=>{};export const useBottomMenu=()=>({handleSelect:fn,hideMenu:fn});'],
    ['hooks/useSnackbar', 'export const useSnackbar=()=>({addSnackbar:()=>{}});'],
    ['hooks/useServiceContext', 'export const useServiceContext=()=>({chromeStorageService:{}});'],
    ['services/usbPresence', 'export const confirmUsbForApproval=async()=>({ok:true});'],
    ['pages/requests/OneSatPermissionRequest', 'export const OneSatPermissionRequestPage=()=>null;'],
  ].map(([name, text]) => [path.join(source, name), text]),
);
let temporary: string;
let browser: Browser;
let server: http.Server;
let origin: string;
const bundles = new Map<string, string>();

async function bundle(counterfactual: boolean): Promise<string> {
  const entry = path.join(temporary, counterfactual ? 'before.tsx' : 'current.tsx');
  await fs.writeFile(
    entry,
    `import {useState} from ${JSON.stringify(path.join(root, 'node_modules/react/index.js'))};
import {createRoot} from ${JSON.stringify(path.join(root, 'node_modules/react-dom/client.js'))};
import {PromptRequestView} from ${JSON.stringify(path.join(source, 'components/PromptRequestView.tsx'))};
function Test(){const[i,setI]=useState(0);return <PromptRequestView screen={window.fixtureScreens[i]} onResponse={()=>{if(i===0)setI(1);else window.fixtureClosed=true}}/>}
createRoot(document.getElementById('root')).render(<Test/>);`,
  );
  const plugin: Plugin = {
    name: 'isolated-prompt-services',
    enforce: 'pre',
    resolveId(name, importer) {
      if (name === 'process') return '\0fixture:process';
      if (name.endsWith('.css')) return '\0fixture:css';
      if (name.startsWith('.') && importer) {
        const resolved = path.resolve(path.dirname(importer), name);
        if (mocked.has(resolved)) return `\0fixture:${resolved}`;
      }
    },
    async load(id) {
      if (id.startsWith('\0fixture:')) {
        const name = id.slice('\0fixture:'.length);
        return name === 'process' ? 'export default {env:{}};' : name === 'css' ? '' : mocked.get(name);
      }
      if (counterfactual && id === path.join(source, 'components/PromptRequestView.tsx')) {
        return (await fs.readFile(id, 'utf8')).replaceAll(' key={screen.requestID}', '');
      }
    },
  };
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [plugin],
    resolve: {
      alias: { react: path.join(root, 'node_modules/react'), 'react-dom': path.join(root, 'node_modules/react-dom') },
    },
    esbuild: { jsx: 'automatic', jsxDev: false },
    define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: false,
      lib: { entry, name: 'PromptQueueFixture', formats: ['iife'] },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const builds = Array.isArray(result) ? result : [result];
  if (builds.length !== 1 || !('output' in builds[0])) throw new Error('Expected one inline browser bundle');
  const chunks = builds[0].output.filter((row) => row.type === 'chunk');
  if (chunks.length !== 1) throw new Error('Unexpected dynamic browser chunks');
  return chunks[0].code;
}

beforeAll(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'yours-prompt-queue-'));
  bundles.set('/before.js', await bundle(true));
  bundles.set('/current.js', await bundle(false));
  server = http.createServer((req, res) => {
    const code = bundles.get(req.url ?? '');
    res.setHeader('Content-Type', code ? 'application/javascript' : 'text/html');
    res.end(code ?? '<!doctype html><html><body><div id="root"></div></body></html>');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No owned loopback fixture address');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await puppeteer.launch({ headless: true });
  expect(browser.process()?.spawnargs).not.toContain('--no-sandbox');
  expect(browser.process()?.spawnargs).not.toContain('--disable-setuid-sandbox');
  if (process.platform === 'linux') {
    const sandbox = await browser.newPage();
    try {
      await sandbox.goto('chrome://sandbox');
      const status = await sandbox.evaluate(() => document.body.innerText);
      expect(status).toMatch(/PID namespaces\s+Yes/);
      expect(status).toMatch(/Seccomp-BPF sandbox\s+Yes/);
      console.log(JSON.stringify({ browser: await browser.version(), sandbox: status }));
    } finally {
      await sandbox.close();
    }
  }
}, 60_000);

afterAll(async () => {
  const failures: unknown[] = [];
  try {
    await browser?.close();
  } catch (error) {
    failures.push(error);
  }
  try {
    if (server?.listening)
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  } catch (error) {
    failures.push(error);
  }
  try {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  } catch (error) {
    failures.push(error);
  }
  if (failures.length) throw new AggregateError(failures, 'Prompt fixture cleanup failed');
});

const spending = (id: string) => ({
  kind: 'permission',
  requestID: id,
  payload: {
    requestID: id,
    type: 'spending',
    originator: 'queue.example.test',
    reason: `queued ${id}`,
    spending: {
      satoshis: 98,
      lineItems: [
        { type: 'output', description: `queued ${id}`, satoshis: 75 },
        { type: 'fee', description: 'Network fee', satoshis: 23 },
      ],
    },
  },
});
const grouped = (id: string) => ({
  kind: 'groupedPermission',
  requestID: id,
  payload: {
    requestID: id,
    originator: 'queue.example.test',
    permissions: {
      description: `queued ${id}`,
      protocolPermissions: (id === 'first' ? ['first protocol'] : ['second protocol', 'another protocol']).map(
        (name) => ({ protocolID: [2, name], counterparty: 'self', description: name }),
      ),
      basketAccess: [{ basket: `${id} basket`, description: 'basket access' }],
      certificateAccess: [{ type: `${id} certificate`, fields: ['name'], description: 'certificate access' }],
      spendingAuthorization: { amount: 100, description: `${id} allowance` },
    },
  },
});

async function open(screens: unknown[], counterfactual: boolean) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin);
  await page.evaluate((screens) => {
    Object.assign(window, {
      fixtureScreens: screens,
      fixtureClosed: false,
      fixtureResponses: [],
      chrome: {
        runtime: {
          sendMessage(message: unknown, callback?: (value: boolean) => void) {
            (window as any).fixtureResponses.push(message);
            callback?.(true);
          },
        },
      },
    });
  }, screens);
  await page.addScriptTag({ url: `${origin}/${counterfactual ? 'before' : 'current'}.js` });
  try {
    await page.waitForFunction(() => document.body.innerText.includes('queued first'));
  } catch (error) {
    const body = await page.evaluate(() => document.body.innerText);
    await page.close();
    throw new Error(`Prompt fixture did not render: ${JSON.stringify({ errors, body })}`, { cause: error });
  }
  return { page, errors };
}
async function button(page: Page, name: string) {
  const handle = await page.waitForFunction(
    (name) => [...document.querySelectorAll('button')].find((row) => row.textContent?.trim() === name),
    {},
    name,
  );
  const element = handle.asElement();
  if (!element) throw new Error(`Missing button ${name}`);
  return element;
}
for (const counterfactual of [true, false])
  test(`${counterfactual ? 'unkeyed counterfactual' : 'production view'} preserves queued spending request identity and processing state`, async () => {
    const { page, errors } = await open([spending('first'), spending('second')], counterfactual);
    try {
      await (await button(page, 'Deny')).click();
      await page.waitForFunction(() => document.body.innerText.includes('queued second'));
      const deny = await button(page, 'Deny');
      expect(await deny.evaluate((element) => (element as HTMLButtonElement).disabled)).toBe(counterfactual);
      if (!counterfactual) {
        await deny.click();
        await page.waitForFunction(() => (window as any).fixtureClosed);
      }
      const responses = await page.evaluate(() => (window as any).fixtureResponses);
      expect(responses.map((r: any) => [r.action, r.requestID, r.granted])).toEqual(
        counterfactual
          ? [['PERMISSION_RESPONSE', 'first', false]]
          : [
              ['PERMISSION_RESPONSE', 'first', false],
              ['PERMISSION_RESPONSE', 'second', false],
            ],
      );
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 20_000);

test('fresh grouped request resets protocol, basket, certificate and spending selections', async () => {
  const { page, errors } = await open([grouped('first'), grouped('second')], false);
  try {
    expect(
      await page.$$eval('input[type="checkbox"]', (rows) => rows.map((row) => (row as HTMLInputElement).checked)),
    ).toEqual([false, true, true, true]);
    for (const checkbox of await page.$$('input[type="checkbox"]')) await checkbox.click();
    await (await button(page, 'Deny All')).click();
    await page.waitForFunction(() => document.body.innerText.includes('queued second'));
    expect(
      await page.$$eval('input[type="checkbox"]', (rows) => rows.map((row) => (row as HTMLInputElement).checked)),
    ).toEqual([false, true, true, true, true]);
    const allow = await button(page, 'Allow Selected');
    expect(await allow.evaluate((element) => (element as HTMLButtonElement).disabled)).toBe(false);
    await allow.click();
    await page.waitForFunction(() => (window as any).fixtureClosed);
    const responses = await page.evaluate(() => (window as any).fixtureResponses);
    expect(responses[0]).toEqual({ action: 'GROUPED_PERMISSION_RESPONSE', requestID: 'first', granted: null });
    expect(responses[1]).toEqual({
      action: 'GROUPED_PERMISSION_RESPONSE',
      requestID: 'second',
      granted: {
        protocolPermissions: grouped('second').payload.permissions.protocolPermissions,
        basketAccess: grouped('second').payload.permissions.basketAccess,
        certificateAccess: grouped('second').payload.permissions.certificateAccess,
      },
    });
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 20_000);
