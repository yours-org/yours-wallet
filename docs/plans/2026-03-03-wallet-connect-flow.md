# Wallet Connect Flow Fix

**Status: COMPLETE** ✅

All major wallet authentication and popup issues have been resolved. The wallet extension now properly handles lock/unlock states, prevents duplicate popups, and maintains proper session management.

---

## What Was Fixed

### 1. Auth Flow Fixes in `background.ts`

**Problem**: Wallet was checking `passKey` presence for auth state, which broke after locking.

**Solution**: 
- `verifyAccess()` now checks `isLocked` flag instead of `passKey` presence
- `lockWallet()` reverted to NOT remove `passKey` from storage (fixes unlock flow)

### 2. Popup Launching Logic

**Problem**: `ensureWallet()` was being called for ALL messages, causing double popups.

**Solution**:
- Message handler now detects internal vs external messages via `sender.origin`
- `ensureWallet()` modified to check for existing wallet before launching popup
- Only launches popup when wallet exists but is locked

### 3. Popup Cleanup

**Problem**: Popup was staying open after unlock/authorization.

**Solution**:
- Popup now closes immediately after unlock
- Proper cleanup of `pendingWalletWaiters` when wallet is ready

### 4. Session Sharing

**Problem**: Two separate session managers (global auth and wallet-toolbox).

**Solution**:
- Server-side: Shared session manager passed to both auth middleware instances
- OR: Bypass wallet-toolbox's auth and use only the global auth (current implementation)

---

## Changes Made

### `src/background.ts`
- Message handler: Added `isFromExtension` check via `sender.origin`
- `ensureWallet()`: Added check for existing wallet before launching popup
- `verifyAccess()`: Changed to check `isLocked` flag
- `launchPopUp()`: Improved window management

### `src/contexts/providers/ServiceProvider.tsx`
- `lockWallet()`: Reverted to NOT remove `passKey` from storage

### Build Output
- Extension rebuilt with all fixes in `build/` directory
- **NOT YET COMMITTED** to git

---

## Verification Checklist

- [x] Locked wallet → Connect Wallet → unlock → approve → popup closes → connected
- [x] Unlocked + whitelisted → Connect Wallet → no popup → connected
- [x] Unlocked + new domain → approval popup → approve → closes
- [x] Locked → dismiss popup → admin shows error
- [x] No double popups when clicking extension icon
- [x] Popup closes immediately after unlock
- [x] Server auth works with wallet BRC-103/104 handshake

---

## Next Steps

1. **Commit the wallet changes**:
   ```bash
   cd yours-wallet
   git add src/background.ts src/contexts/providers/ServiceProvider.tsx
   git commit -m "fix: wallet auth flow and popup behavior"
   git push origin brc100-remote
   ```

2. **Test with admin setup** (if admin setup button issue is resolved)

3. **Test OpNS/Paymail flows** once admin is configured

---

## Server-Side Companion Changes

The server also required changes to work with the wallet:

- Setup routes moved from `/admin/api/*` to `/admin/setup/*`
- Auth middleware refactored for HTTP-layer composition
- Wallet routes now use `HTTPHandler()` for proper auth context flow

See `1sat-stack/docs/plans/2026-03-03-admin-opns-registration.md` for details.
