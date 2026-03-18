# CWI Intermittent Hang Investigation

**Status: In Progress**

## Problem

CWI calls from dApp pages intermittently hang — no response, no error. The page freezes waiting for a response that never comes. This appears to happen when the page is reloaded but the extension service worker has NOT been reloaded.

## Symptoms

- `connectWallet()` or `performSetup()` (AuthFetch handshake) freezes
- Service worker logs show the message was received and `authorizeRequest` returned `true`
- The `processCWI*` handler is entered but never completes
- No network requests leave the page (e.g. `.well-known/auth` POST never fires)
- Reloading the extension fixes it temporarily

## Observed Failure Points

### getPublicKey hang (first observed)
- `cwi_getPublicKey` received, authorized
- No further logs — handler never responded
- After adding logging and rebuilding, this started working

### verifyHmac hang (second observed)
- `cwi_verifyHmac` received, authorized
- No further logs — handler never responded
- This is during AuthFetch handshake (BRC-103/104), before any HTTP request goes out
- AuthFetch calls verifyHmac as part of constructing the authenticated request

## Suspected Cause

The service worker's internal state becomes stale after the page reloads. Possible causes:

1. **WalletPermissionsManager state**: Permission tokens are cached in memory. After page reload, the originator changes or cache becomes invalid, causing `ensureProtocolPermission()` to call `findProtocolToken()` which does `listOutputs()` against remote storage — this remote call may silently fail or never resolve.

2. **accountContext staleness**: `ensureWallet()` returns an existing `accountContext.wallet` that has stale internal state (dead connections, expired sessions).

3. **Promise never resolving**: Inside `WalletPermissionsManager`, if `findProtocolToken()` or `requestPermissionFlow()` encounters an error that isn't caught, the async handler would hang forever since there's no timeout or error boundary.

## Diagnostic Logging Added

Added `console.log`/`console.error` entry/exit logging to these handlers in `background.ts`:

- `processCWIGetPublicKey` — logs entry, ensureWallet completion, getPublicKey result, errors
- `processCWIVerifyHmac` — logs entry, ensureWallet completion, verifyHmac result, errors
- `processCWICreateSignature` — logs entry, ensureWallet completion, createSignature result, errors
- `processCWIVerifySignature` — logs entry, ensureWallet completion, verifySignature result, errors

All handlers have try/catch wrapping the full body with error logging.

## Background.ts Audit Findings

Issues identified but NOT yet fixed (need to verify they're not the cause first):

1. **Fire-and-forget handlers**: In the main message listener switch (lines ~631-743), `processCWI*` functions are called without `return` — their returned promises are discarded. Chrome doesn't care (it uses `sendResponse`), but if the handler throws synchronously before reaching the try/catch, the error is lost.

2. **No response on unknown action**: The `default: break` case in the switch sends no response, leaving the caller hanging forever.

3. **Redundant ensureWallet()**: Each `processCWI*` handler calls `ensureWallet()` again internally, even though the outer chain already called it.

4. **noAuthRequired default path**: Returns `undefined` instead of `true` for unrecognized actions that fall through.

5. **Sync try/catch wrapping async .then()**: `processGetPubKeysRequest`, `processGetLegacyAddressesRequest`, `processGetSocialProfileRequest` use sync try/catch around `.then()` chains — doesn't catch async errors.

6. **Permission response optional chaining**: Handlers use `accountContext?.wallet` which silently returns undefined if accountContext is null, potentially causing downstream undefined errors that aren't caught.

## Reproduction Steps

1. Load extension fresh (works)
2. Navigate to admin page, connect wallet, complete setup (works)
3. Reload the admin page (don't reload extension)
4. Try to connect wallet or perform authenticated action
5. Observe hang — service worker shows message received but no completion

## Next Steps

- [ ] Reproduce the hang with current diagnostic logging to identify exact stall point
- [ ] Check if `ensureWallet()` returns a stale wallet instance after page reload
- [ ] Check if `WalletPermissionsManager` internal state survives page reloads correctly
- [ ] Fix the audit findings (especially default:break and fire-and-forget pattern)
- [ ] Consider adding a health check or staleness detection for the wallet instance
