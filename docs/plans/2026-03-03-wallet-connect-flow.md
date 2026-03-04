# Wallet Connect Flow Fix

## Context

Two issues block the admin UI → Yours Wallet connect flow:

1. **Server returns 401 on `/admin/api/status`** — Fiber merges group middleware for groups sharing the same prefix. `AdminGuard` on `guardedGroup` runs for setup routes on `setupGroup` because both use `prefix + "/api"`.
2. **Wallet popup stays open** — `ensureWallet()` opens a popup when the background service worker can't initialize the wallet on startup (e.g. `createRemoteWallet` fails, passKey expired). If the popup determines the wallet is already unlocked (based on `lastActiveTime`), it shows the balance page and never sends `WALLET_UNLOCKED`. The background hangs waiting on `pendingWalletWaiters`.

## Status of prior changes (already in working tree)

- `ensureWallet()` gate in `background.ts` — all external CWI requests go through it ✅
- `processCWIWaitForAuthentication` simplified — direct `respond()` ✅
- Popup cleanup for authorized case — `immediateResponse` closes popup via `removeWindow` ✅
- `connectRequest` in Web3Provider storage listener ✅

## Remaining changes

### 1. Fix server 401: separate setup routes from guarded routes

**Root cause**: `config.go` line 993 creates `guardedGroup` and `setupGroup` with the same prefix `prefix + "/api"`. Fiber applies `AdminGuard` to all routes matching that prefix, including `/status` on `setupGroup`.

**Fix**: Register setup routes on `publicGroup` with explicit `/api/` path prefix. URLs stay identical (`/1sat/admin/api/status`, `/1sat/admin/api/setup`), but the routes avoid the `AdminGuard` middleware.

**Files:**
- `1sat-stack/cmd/server/config.go` (~line 993) — remove `setupGroup`, pass 2 groups instead of 3
- `1sat-stack/admin/routes.go` (line 59) — change `Register(guardedGroup, publicGroup, setupGroup)` to `Register(guardedGroup, publicGroup)`, register setup routes on `publicGroup` with `/api/status` and `/api/setup` paths

### 2. Popup proactive unlock notification

**Root cause**: When the popup opens and `isLocked` is false (user was active recently), it shows the balance page. The background's `pendingWalletWaiters` never get resolved because `WALLET_UNLOCKED` is only sent from `UnlockWallet.tsx` after password entry.

**Fix**: In `yours-wallet/src/App.tsx`, add a `useEffect` that sends `WALLET_UNLOCKED` to the background when the popup mounts while already unlocked (`isReady && !isLocked`). The background handler handles this safely — if the wallet is already initialized, it's a no-op or re-init.

```typescript
useEffect(() => {
  if (isReady && !isLocked) {
    chrome.runtime.sendMessage({ action: 'WALLET_UNLOCKED' }).catch(() => {});
  }
}, [isReady, isLocked]);
```

## Verification

1. Server: `curl -s -o /dev/null -w "%{http_code}" http://192.168.50.40:8080/1sat/admin/api/status` → `200`
2. Rebuild server on rack: `go build -o server ./cmd/server && pm2 restart stack`
3. Rebuild extension: `cd yours-wallet && bun run build`
4. Reload extension in Chrome, refresh admin page → no error toast
5. Test flows:
   - Locked → Connect Wallet → unlock → approve → popup closes → connected
   - Unlocked + whitelisted → Connect Wallet → no popup → connected
   - Unlocked + new domain → approval popup → approve → closes
   - Locked → dismiss popup → admin shows error
