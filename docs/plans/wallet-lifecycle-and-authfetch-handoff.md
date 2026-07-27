# Handoff: wallet lifecycle PR trim + AuthFetch hang

**Date:** 2026-07-27  
**Branch (yours-wallet):** `fix/dapp-popup-lifecycle` (uncommitted local work)  
**Context limit:** write-up for a compacted follow-up session

---

## 1. Bottom line

| Question | Answer |
|----------|--------|
| Root cause of multi-minute wallet freeze? | **AuthFetch never settling** after HTTP 200 when Peer handling fails (errors swallowed), often with **session `your-nonce` mismatch** on remote storage. Server multi-node session store is a likely trigger; client must still fail closed. |
| Did we need a large yours-wallet lifecycle rewrite? | **No.** Hang is explained without it. Large drop/create/epoch machinery is **overbuilt** for the hang. |
| What *is* justified in yours-wallet? | Dual-sync cleanup, passKey lock gate, thin single create/close, internal `ensureWallet(true)`. |
| ts-stack / `@bsv/sdk` | Issue draft ready (not filed). Swallow still on ts-stack HEAD. |

---

## 2. AuthFetch hang (facts only)

### Call path (yours-wallet → library)
```
getBalance
  → baseWallet.balance()                    // toolbox Wallet
  → listOutputs({ basket: specOpWalletBalance })  // 893b7646…
  → WalletStorageManager.listOutputs
  → runAsReader (holds storage reader lock for entire body)
  → active store = StorageClient (remote)
  → rpcCall → await authClient.fetch(POST jsonrpc)
  → AuthFetch (new AuthFetch(wallet) in StorageClient ctor)
```

Debug account storage: `activeRemote: https://wallet.1sat.app`.

### Mechanism (code)
- `AuthFetch.fetch` Promise settles **only** via general-message listener `resolve`/`reject`, not on HTTP completion.
- `SimplifiedFetchTransport` finishes HTTP, then `onDataCallback` **without awaiting** Peer handling.
- `onData`: `void callback(m).catch(() => {})` — **Peer errors discarded**.
- If `processGeneralMessage` throws (e.g. session lookup by response `your-nonce` fails) → **fetch never settles** → reader lock stuck → wallet frozen until SW restart.

### Captured hang (2026-07-27 UTC)
- **Time:** 02:13:29.260 → 02:13:30.479  
- **RPC:** `listOutputs` balance basket `893b7646…`, jsonrpc id `9`  
- **Identity:** `03a973b04fb5dcbdf4cb9b8a6ff68b6dc6983c96042b3cbf1fcde870b97d762449`, userId `798`  
- **request-id (req=res):** `3cvRu+3s9rmBEboTNBMOVgcKQ74GaWQuQVWxhFkU4mU=`  
- **REQ your-nonce:** `FfDNQ77WJWVt04wy7B+djtT5s8avELfYhgPdwAhZSzWmpfrYjACQPO3iR8rV4Dbw`  
- **RES your-nonce:** `AtcP59UHSNpS2P+zFsrCzugGdogb9V4m3yfAL1TaqkoSMSnny9NxRBrV4ru8QJq8`  
  (sibling successes in same client generation used stable RES `your-nonce=e7/2MTwIF5Y…`)  
- **Body:** `{"totalOutputs":72949,"outputs":[]}` — HTTP success, client still hung  
- No second client `initialRequest` between `create: live` (02:13:25.907) and hang  

### Logs on disk
- `/var/folders/8k/gjdw57kx77d74ksrvxzsvqs00000gn/T/opencode/authfetch-repro.log`
- `/var/folders/8k/gjdw57kx77d74ksrvxzsvqs00000gn/T/opencode/authfetch-repro-events.json`
- Script: `scripts/repro-authfetch-hang.ts`

### Server follow-up (separate agent)
Already in flight: multi-node session store / wrong `your-nonce` on response. Client library should still reject `fetch` on Peer failure.

### Draft ts-stack issue (not filed)
See conversation: scope **only** `@bsv/sdk` / ts-stack — hang after HTTP 200 when Peer errors swallowed; request settle on failure; tests. No yours-wallet/server product scope in the issue body beyond consumer evidence.

---

## 3. yours-wallet work — keep vs trim

### Keep (justified)
1. **Remove dual UI+SW address sync** — `ServiceProvider` must not run `syncAddresses`/`syncMessages` while SW does. Real race.  
2. **UI lock requires passKey + timeout** — not `lastActiveTime` alone.  
3. **Internal handlers `ensureWallet(true)`** — no unlock-popup hang for extension-internal balance/storage/permissions.  
4. **Thin single create/close** — one obvious path that creates wallet and one that tears it down; avoid duplicate init from unlock/switch/startup if easy.  
5. **Do not re-delete** `let chromeStorageService = new ChromeStorageService()` at top of `background.ts` (was accidentally removed mid-rework; SW never registered `onMessage`).

### Trim / revert (overbuilt for hang justification)
1. **`walletLifecycle.ts` epoch/gate/timeout theater** — optional thin wrapper OK; don’t need heavy epoch machinery as “the fix.”  
2. **Narrative that lifecycle rewrite fixed the freeze** — it didn’t; AuthFetch/session did.  
3. **Any “destroy must await all readers” complexity** sold as root-cause fix — hang is AuthFetch not settling.  
4. **Large bulk replace noise** in `background.ts` — review diff; keep behavior fixes, drop churn.

### PR posture
- Prefer a **small PR**: dual-sync + passKey gate + ensureWallet(true) + minimal create/drop cleanup.  
- Or split: (A) UX/sync fixes, (B) optional lifecycle tidy.  
- Do **not** market big lifecycle as hang fix.

---

## 4. Current code map (after this session)

| Piece | Role |
|-------|------|
| `src/walletLifecycle.ts` | `dropWallet` / `createWallet` / `getLiveContext` — **candidate to thin** |
| `src/background.ts` | `bringWalletLive`, lock/unlock/switch → drop/create; **must keep** `chromeStorageService` init |
| `src/initWallet.ts` | `createWebWallet`, `alive`, `runWalletSync` on become-live |
| `src/contexts/providers/ServiceProvider.tsx` | passKey lock; **no** UI dual sync |
| Build version | bumped in `public/manifest.json` / `package.json` (was 5.0.8 at last good test) |

### Lifecycle behavior as left (if keeping thin version)
- **Gone:** no live context; APIs fail fast (`Wallet not available`).  
- **Live:** one context; SW starts address/message sync on create; popup-open may join sync.  
- **drop:** null live immediately; close in background (so lock isn’t blocked on hung fetch).  
- **create:** drop first, then `initWallet`; discard if dropped mid-create (epoch) — **epoch may be simplified**.

---

## 5. What already validated (v5.0.8, headed Puppeteer, debug profile)

**Pass:** SW listeners; locked fail-fast (balance/address/storageGetInfo); unlock → balance `72949` + receive `1Emet8LbkgdpZikKPxuaw9QH442zkqkH82`; lock immediate; second unlock address; reload locked fail-fast.

**Flake / known:** second unlock concurrent balance spam can still hit AuthFetch hang (not lifecycle “wallet missing”).

**Debug wallet:** `.debug-wallet.json` (gitignored) — password `testwallet1`, address above; profile `.puppeteer-profile/`.  
**Test scripts:** `scripts/validate-lifecycle.ts`, `scripts/repro-authfetch-hang.ts`, `scripts/stress-lock-unlock.ts` (older).

---

## 6. Plan for compacted session (ordered)

### A. Trim yours-wallet PR (first)
1. `git diff` full yours-wallet; list files touched.  
2. Decide keep set from §3.  
3. Revert or gut `walletLifecycle` heaviness if present — leave at most thin drop/create + `getLive*`.  
4. Ensure `chromeStorageService` top-level init remains.  
5. Ensure ServiceProvider has no dual sync; passKey lock remains.  
6. Rebuild; one headed unlock → balance → lock → fail-fast smoke (no multi-cycle spam).  
7. Draft small PR description: dual-sync + lock gate + internal ensureWallet; **not** AuthFetch fix.

### B. AuthFetch / ts-stack (parallel or after)
1. Confirm swallow still on ts-stack HEAD (`SimplifiedFetchTransport.onData`).  
2. File or hand off issue from draft (library-only).  
3. Optional patch: on Peer `handleIncomingMessage` failure, reject pending AuthFetch callbacks; add unit test.  
4. Server session PR (other agent) — track separately; client fail-closed still required.

### C. Do not do in next session unless asked
- More Puppeteer multi-cycle stress as primary “lifecycle proof.”  
- Peer/cert deep dives without hang capture.  
- Expanding lifecycle state machines.

---

## 7. Open questions for human
- Keep any `walletLifecycle.ts` at all, or inline thin helpers in `background.ts`?  
- File ts-stack AuthFetch issue now or wait for server session PR?  
- Ship small yours-wallet PR before/after AuthFetch patch?

---

## 8. One-paragraph status for humans

We found the freeze: remote `listOutputs`/`balance` holds a storage reader during `AuthFetch.fetch`; if Peer handling fails after HTTP 200 (errors swallowed in SimplifiedFetchTransport), fetch never completes and the wallet wedges. A hang capture showed request-id OK but response `your-nonce` differing from the session used on sibling RPCs—server session work is in flight; client must still reject. The large yours-wallet lifecycle rewrite is not justified by that hang; keep dual-sync removal, passKey lock, and thin create/drop only, then open a focused `@bsv/sdk` issue/fix for AuthFetch promise settlement.
