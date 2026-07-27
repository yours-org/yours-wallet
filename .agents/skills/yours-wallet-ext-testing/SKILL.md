---
name: yours-wallet-ext-testing
description: Agent-driven Chrome extension testing for yours-wallet using Puppeteer + Chrome for Testing. Use when debugging extension hangs, reload stuck states, service worker init, popup/UI automation, or funding a debug wallet.
version: 0.1.0
prerequisites:
  commands: [bun]
  env_vars: []
metadata:
  scope: [development, bsv, 1sat, chrome-extension]
  agents: [claude, opencode, hermes]
  expertise: [intermediate, advanced]
  freshness: 2026-07-26
---

# yours-wallet extension testing (Puppeteer)

Agent-operated E2E / debug harness for the Yours Wallet MV3 extension.

## Why this stack

- **Chrome recommends Puppeteer** for extension E2E: https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing
- **Puppeteer extension guide:** https://pptr.dev/guides/chrome-extensions
- **Do not use system Google Chrome.** Branded Chrome ignores `--load-extension` (`not allowed in Google Chrome, ignoring`).
- Use **full `puppeteer`** (not `puppeteer-core` alone). It downloads **Chrome for Testing (CfT)** and supports `enableExtensions`.

Playwright can load extensions via bundled Chromium, but Puppeteer has better first-party SW/popup hooks (`enableExtensions`, SW `worker.evaluate`, `chrome.action.openPopup`).

## Paths (repo-relative)

Repo root = yours-wallet checkout (e.g. `~/Source/1sat/yours-wallet` or wherever the clone lives). Always resolve relative to that root — never hardcode a machine-specific absolute home path in scripts or docs.

| Path | Purpose |
|------|---------|
| `build/` | Packed extension (load this) |
| `.puppeteer-profile/` | **Default persistent CfT user-data-dir** (keys, storage, IndexedDB). Gitignored. |
| `.debug-wallet.json` | Debug secrets: password, seed, extensionId, receiveAddress. Gitignored. |
| `scripts/debug-extension.ts` | Launch harness |
| `.debug-session.log` | Optional agent session log (create as needed; gitignore if used) |

**Default recommendation:** always reuse `.puppeteer-profile/` so funded test wallets survive across runs. Only delete it when intentionally wiping the debug wallet.

## One-time setup

```bash
cd <yours-wallet-root>
bun install          # includes puppeteer → installs CfT
bun run build        # produces build/
```

Confirm CfT (not system Chrome):

```bash
bun -e 'import p from "puppeteer"; console.log(await Promise.resolve(p.executablePath()))'
# expect: .../.cache/puppeteer/chrome/.../Google Chrome for Testing.app/...
```

## Commands

```bash
bun run debug:ext                 # launch CfT, load build/, open UI, keep open
bun run debug:ext -- --create     # create wallet if profile has none
bun run debug:ext -- --reload     # chrome.runtime.reload() then re-attach SW
bun run debug:ext -- --headless   # headless CfT (extensions need new headless / CfT)
```

Harness defaults:

- Profile: `.puppeteer-profile/`
- Create password: `testwallet1`
- Account name: `debug`
- Secrets written to `.debug-wallet.json`

## Official launch pattern

```ts
import puppeteer from 'puppeteer';
import { resolve } from 'path';

const extensionPath = resolve('build');
const profileDir = resolve('.puppeteer-profile');

const browser = await puppeteer.launch({
  headless: false,
  enableExtensions: [extensionPath],
  userDataDir: profileDir,
  args: ['--window-size=420,760', '--no-first-run', '--no-default-browser-check'],
});

const swTarget = await browser.waitForTarget(
  (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
);
const worker = await swTarget.worker();
const extensionId = new URL(worker.url()).hostname;

// Full-tab UI (more reliable than popup for automation)
const page = await browser.newPage();
await page.goto(`chrome-extension://${extensionId}/index.html`);

// Mirror logs
worker.on('console', (m) => console.log('[sw]', m.type(), m.text()));
page.on('console', (m) => console.log('[ui]', m.type(), m.text()));
```

### Service worker eval

```ts
const info = await worker.evaluate(async () => {
  // @ts-expect-error chrome in SW
  const local = await chrome.storage.local.get(null);
  // @ts-expect-error chrome in SW
  const session = await chrome.storage.session.get(null);
  return { localKeys: Object.keys(local), sessionKeys: Object.keys(session) };
});
```

### Messages from the UI page

```ts
const resp = await page.evaluate(async () => {
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getReceiveAddress' }, (r) =>
      resolve({ r, err: chrome.runtime.lastError?.message }),
    );
  });
});
```

## Auth model agents must understand

| Store | Key facts |
|-------|-----------|
| `chrome.storage.local` | Encrypted keys, `isLocked`, `lastActiveTime`, accounts |
| `chrome.storage.session` | `passKey` only (memory; **cleared on full browser restart**) |

- SW wallet init (`initWallet` / `accountContext`) **requires** session `passKey`.
- UI “unlocked” is driven largely by `lastActiveTime` within lock timeout **without** re-checking session `passKey`.
- Unlock UI path: password → `verifyPassword` → sets session `passKey` → message `WALLET_UNLOCKED` → SW `initializeWallet`.

### Force a clean unlock (agent recipe)

When the UI shows Coins/Balance but SW returns `Wallet not initialized` / empty Receive:

```ts
await page.evaluate(async () => {
  await chrome.storage.local.set({ isLocked: true, lastActiveTime: 0 });
});
await page.reload({ waitUntil: 'domcontentloaded' });
// fill password from .debug-wallet.json, submit Unlock form
// wait for SW log: initializeWallet: accountContext: true
```

### Repro: stuck “loaded but dead” UI

```ts
// After a normal unlock:
await page.evaluate(async () => {
  await chrome.storage.session.remove('passKey');
  // leave lastActiveTime recent
});
await page.reload();
// Expect: main wallet UI (no Unlock screen) + getReceiveAddress → "Wallet not initialized"
```

This matches “reload extension / restart browser → stuck until reload again” when the second reload races lock state differently.

## Sync / loading spinner

- UI address/owner-style work runs after unlock via `ServiceProvider` (`syncAddresses`, etc.).
- `useSyncTracker` listens for a SW `complete` event; if missing:  
  `[syncTracker] No complete received within safety window — stopping spinner.`
- Deposit handling may `internalizeAction` then `sweepDeposit` (`createAction`). Failures like “output … spendable=false” mean chain/local UTXO mismatch or already-swept outpoint — not necessarily a hang, but can leave UX looking broken.

## Isolation rules (important)

- Harness uses **only** `.puppeteer-profile/` + CfT. It does **not** touch the user’s daily Chrome profile.
- Safe to run while another agent uses normal Chrome.
- **Do not** close the CfT window mid-run; that kills the Puppeteer target (`TargetCloseError`).
- Kill leftovers if needed: `pkill -f '.puppeteer-profile'` (only matches this profile dir name).

## Funding a debug wallet

1. `bun run debug:ext -- --create` (once per fresh profile).
2. Unlock (or use force-unlock recipe).
3. `getReceiveAddress` → store on `.debug-wallet.json` as `receiveAddress`.
4. Fund that address with small BSV / test assets.
5. Re-open harness, unlock, confirm `listOutputs` / UI balance / `internalizeAction` logs.

Never commit `.debug-wallet.json` or `.puppeteer-profile/`.

## Agent workflow checklist

1. `bun run build` if `src/` changed.
2. Launch with persistent `.puppeteer-profile/`.
3. Attach SW + UI console mirrors before acting.
4. Ensure session `passKey` before asserting wallet APIs.
5. Prefer `chrome-extension://<id>/index.html` over real popup unless testing popup specifically.
6. For reload tests: `worker.evaluate(() => chrome.runtime.reload())`, wait for new SW target, re-open UI (expect brief `ERR_BLOCKED_BY_CLIENT` until SW is back).
7. Log findings to terminal / `.debug-session.log`; keep secrets in `.debug-wallet.json` only.

## Known pitfalls

| Symptom | Likely cause |
|---------|----------------|
| Extension never loads | Pointed at system Chrome instead of CfT / missing `enableExtensions` |
| `Wallet not initialized` with main UI visible | Session `passKey` missing; UI unlocked via `lastActiveTime` only |
| Empty Receive panel | Same as above, or `accountContext` null before unlock |
| Spinner then safety-window warn | SW never sent sync `complete` |
| `ERR_BLOCKED_BY_CLIENT` after reload | Navigated before extension SW finished restarting |
| `Target closed` | Human/agent closed CfT window or killed profile Chrome |
| Balance 0 after fund | Still syncing; wrong address; or sweep/internalize error in SW log |

## References

- Puppeteer Chrome Extensions: https://pptr.dev/guides/chrome-extensions
- Chrome extension E2E: https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing
- Chrome for Testing: https://developer.chrome.com/blog/chrome-for-testing
- SW termination testing: https://developer.chrome.com/docs/extensions/how-to/test/test-serviceworker-termination-with-puppeteer
