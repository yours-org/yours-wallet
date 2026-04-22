# Contributing to Yours Wallet with AI Agents

This guide gives AI agents (Claude Code, Cursor, Copilot, etc.) the context they need to fix bugs, implement features, and submit PRs to Yours Wallet.

## Project Overview

Yours Wallet is a Chrome extension (Manifest V3) built with React + TypeScript + Vite. It uses BRC-100 for transaction management, communicates with a background service worker via `chrome.runtime.sendMessage`, and supports remote storage providers for multi-device sync.

**Runtime:** Bun (not npm/yarn). Use `bun install`, `bun run build`, `bun run format`.

## Architecture at a Glance

```
popup (React SPA)
  └── chrome.runtime.sendMessage ──► background service worker
                                        ├── @1sat/wallet-browser (wallet factory)
                                        ├── @bsv/wallet-toolbox-mobile (IndexedDB + remote sync)
                                        └── WalletPermissionsManager (BRC-100 permissions)
```

- **Popup UI** renders in Chrome's extension popup (392x567). All pages share a `TopNav` and `BottomMenu`.
- **Background service worker** (`src/background.ts`) owns the wallet lifecycle. It initializes on unlock, handles all CWI (Chrome Wallet Interface) messages, and manages remote storage.
- **Communication** is fire-and-forget or request/response via `chrome.runtime.sendMessage`. The popup never directly accesses IndexedDB or the wallet — everything goes through the background.

## Key Files

| File                                        | Purpose                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/background.ts`                         | Service worker. Message routing, wallet init, storage handlers, permission callbacks. ~2400 lines.  |
| `src/initWallet.ts`                         | Wallet factory. Reads `storageConfig`, creates `WebWallet`, sets up sync context.                   |
| `src/App.tsx`                               | Root component. Routing, lock screen, request handling, port connection to background.              |
| `src/pages/BsvWallet.tsx`                   | Main wallet view. Balances, send/receive, asset rows, backup promo.                                 |
| `src/pages/OrdWallet.tsx`                   | Ordinals grid. Selection modes (transfer vs cancel), infinite scroll, filters.                      |
| `src/pages/Settings.tsx`                    | Settings. Identity profile, wallet backup, remote storage, account management.                      |
| `src/pages/StorageStatus.tsx`               | Remote storage UI. Active/backup stores, provider status, usage bars.                               |
| `src/components/ProviderPicker.tsx`         | Known provider list + custom remote entry. AuthFetch status checks.                                 |
| `src/components/BackupPromo.tsx`            | Onboarding walkthrough. Key download, remote backup setup.                                          |
| `src/hooks/useIdentity.ts`                  | BAP identity. Publish, update profile, inscribe avatar.                                             |
| `src/hooks/useRemoteStatus.ts`              | Live `/account/status` fetching for known providers.                                                |
| `src/services/types/chromeStorage.types.ts` | All Chrome storage types. `Account`, `Settings`, `StorageConfig`.                                   |
| `src/utils/constants.ts`                    | Constants. Default account shape, fee rates.                                                        |
| `src/utils/tools.ts`                        | Error message mapping, storage payment error detection.                                             |
| `src/pages/AppsAndTools.tsx`                | Connected apps, broadcast, decode, lock/unlock, support donations. ~900 lines.                      |
| `src/pages/SweepMigration.tsx`              | Legacy asset sweep/migration flow. ~1100 lines.                                                     |
| `src/pages/PermissionsManager.tsx`          | BRC-100 permission grants management UI.                                                            |
| `src/pages/requests/`                       | dApp request pages: ConnectRequest, PermissionRequest, TransactionApprovalRequest, MNEESendRequest. |
| `src/pages/onboarding/`                     | Onboarding: Start, CreateAccount, RestoreAccount, ImportAccount, MasterRestore.                     |
| `src/services/types/provider.types.ts`      | Wallet-specific types (NetWork, Addresses, Balance, etc.). Replaces yours-wallet-provider.          |
| `docs/remote-storage-provider.md`           | Guide for running a storage server.                                                                 |
| `docs/provider-api.md`                      | dApp integration API reference.                                                                     |

## Conventions

### Code Style

- **Prettier** enforced via pre-commit hook. Run `bun run format` before committing.
- **No Co-Authored-By** lines in commit messages.
- **Tailwind CSS** with inline styles for theme colors (`theme.color.global.*`).
- **Framer Motion** for animations. Use `pageVariants`, `stagger`, `rowVariant` patterns from Settings.tsx.
- **`<Show when={...}>` component** for conditional rendering (not ternaries in JSX).

### State Management

- No Redux/Zustand. State is local (`useState`) or from Chrome storage via `ChromeStorageService`.
- `useServiceContext()` provides `chromeStorageService`, `keysService`, `apiContext`, `wallet`.
- `useTheme()` for all colors. Never hardcode colors except in dark-UI components (StorageStatus, BackupPromo).

### Chrome Extension Patterns

- **Background ↔ Popup**: `chrome.runtime.sendMessage` with action-based routing.
- **Port connection**: Popup connects via `chrome.runtime.connect({ name: 'extension-popup' })` so background knows when the popup is open.
- **No-auth-required actions** are handled directly in the message switch. Auth-required actions go through `ensureWallet()`.
- **Per-account settings**: Stored in `account.settings.*` (not global Chrome storage).

### 1Sat SDK

- Actions are called via `action.execute(apiContext, options)`.
- `apiContext` comes from `useServiceContext()` — it wraps a `CWI` that proxies to the background.
- `AuthFetch` from `@bsv/sdk` handles BRC-103 mutual authentication for remote server calls.

## Common Tasks

### Adding a new setting

1. Add the field to `Settings` type in `src/services/types/chromeStorage.types.ts`
2. Add default value in `src/utils/constants.ts` → `DEFAULT_ACCOUNT`
3. Add UI in `src/pages/Settings.tsx` (follow the `SettingRow` / `Section` pattern)
4. Read/write via `chromeStorageService.updateNested('accounts', { [identityAddress]: { settings: { ... } } })`

### Adding a new background message handler

1. Add the action string to the `noAuthRequired` array (if no wallet needed) or let it fall through to `ensureWallet()`
2. Add the `case` in the message switch
3. Create a `processYourAction` function following existing patterns
4. Call `sendResponse({ type: 'YOUR_ACTION', success: true, data: ... })`

### Adding a new page/sub-page in Settings

1. Add to the `SettingsPage` type union
2. Add the page variable (e.g. `const myPage = (...)`)
3. Add the render: `{page === 'my-page' && myPage}`
4. Add navigation: `setPage('my-page')`

### Fixing ordinal selection behavior

- Selection logic is in `OrdWallet.tsx` → `toggleOrdinalSelection`
- `selectionMode` is derived from current selection: `'transfer'` (unlisted) or `'cancel'` (listed)
- `isOrdinalDisabled` greys out cards that don't match the current mode
- `OrdCard` accepts a `disabled` prop

### Working with remote storage

- `StorageConfig` (`{ activeRemote?: string; remotes?: string[] }`) is per-account
- Background handlers: `STORAGE_ADD_REMOTE`, `STORAGE_REMOVE_REMOTE`, `STORAGE_SET_ACTIVE_STORAGE`, `STORAGE_SYNC_BACKUPS`, `STORAGE_GET_INFO`
- `useRemoteStatus` hook fetches `/account/status` for known providers, BRC-103 liveness for custom remotes
- Known providers are in `KNOWN_PROVIDERS` array in `ProviderPicker.tsx`

## Building and Testing Locally

### Build

```bash
bun install
bun run format         # Fix code style (required — pre-commit hook enforces this)
bun run build          # Outputs to build/
```

### Load in Chrome

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked** and select the `build/` folder from your project

> **WARNING: If you have the production Yours Wallet installed from the Chrome Web Store, disable it first.** Having two instances of Yours Wallet running simultaneously will cause conflicts — duplicate popups, message routing collisions, and unpredictable behavior. Go to `chrome://extensions/`, find the store version, and toggle it off before loading your dev build.

### Reload After Changes

After making code changes:

1. Run `bun run build`
2. Go to `chrome://extensions/`
3. Click the **reload icon** on your unpacked extension card
4. Close and reopen the extension popup to see changes

If the service worker is in a bad state (stale data, stuck initialization), click **"Service worker"** on the extension card to open DevTools, then check the Console for errors. You may need to delete the wallet's IndexedDB from Application > IndexedDB in DevTools to reset.

## Submitting a PR

1. Fork the repo and create a branch from `main` (or the active development branch)
2. Make your changes
3. Run `bun run format` and `bun run build` — both must pass
4. Commit with a clear message describing what changed and why
5. Open a PR with:
   - **Summary**: 1-3 bullet points
   - **What changed**: Which files and why
   - **How to test**: Steps to verify the fix/feature in the extension

## Gotchas

- **Service worker lifecycle**: Chrome kills the service worker after 30 seconds of inactivity. Module-level variables are lost. Use `chrome.storage.local` for persistence or `chrome.runtime.onConnect` for lifecycle tracking.
- **Popup size**: The extension popup is 392x567px. Always check that content doesn't overflow behind the bottom nav (`z-[100]`). Use `pb-20` for scroll clearance.
- **`height: calc(75%)`**: The Settings page container uses this. Sub-pages with long content need to account for it.
- **AuthFetch**: Used for BRC-103 mutual auth. It automatically negotiates via `POST /.well-known/auth` at the server's origin. Don't call `.well-known/auth` directly.
- **StoragePaymentError**: Thrown by `@1sat/wallet` when a 507 auto-payment fails. Detect via `err?.code === 'storage-payment-failed'`. Handled in `src/utils/tools.ts`.
- **Formatter**: The pre-commit hook runs Prettier. If your commit fails, run `bun run format` and try again.
