# Storage reconcile

## Problem

v5.0.1 (`migrateToV6`) flipped accounts from local-active to `https://wallet.1sat.app`-active without a full push. The switch-time merge in `@bsv/wallet-toolbox` `WalletStorageManager.setActive` is incremental: the reader skips rows where `since > updated_at`, and `since` is the remote's sync-state `when` for the local store, already advanced by months of backup syncing. Local rows older than that were never sent. The existing "Storage repair" (`processStorageRepairSync` in `src/background.ts`) does `setActive('local')` then `setActive(remote)`, which runs the same incremental merge and cannot recover them.

Each store may also have built transactions while active without seeing the other's spends, so the two histories can diverge.

## Model

The blockchain is authoritative. A given transaction does not have conflicting statuses across stores. Differences are:

1. **One-sided records** — a transaction, output, proof, basket, tag, label or certificate present in only one store.
2. **Spend conflicts** — an output whose `spentBy` differs between stores, or which is spent by different transactions in each store. At most one spend is on chain.

## Approach

Work entirely through the `WalletStorageSync` interface (`getSyncChunk` / `processSyncChunk`) against the local `StorageIdb` (`accountContext.storage`) and the remote `StorageClient` (`accountContext.remoteStorage`). Direct IndexedDB access is a fallback only if the interface proves insufficient.

Ships as a new yours-wallet release. The existing Storage repair button (`processStorageRepairSync`) is rewired to run the steps below in one pass.

### Diff

1. Full read of each store via `getSyncChunk` with `since` undefined, paging offsets until done. `getSyncChunk` only reads.
2. Match records by natural key, not by per-store ids:
   - transactions / proven txs: `txid` (transactions without a txid: `reference`)
   - outputs: `txid` + `vout`
   - baskets, labels, tags: name
   - certificates: `certifier` + `serialNumber`
3. Classify:
   - present only in local
   - present only in remote
   - spend conflicts: outputs both stores hold where the spending transaction differs (including spent on one side only)
4. Settle each spend conflict from `OneSatServices` (`@1sat/client`):
   - `txo.getSpends` (1sat-stack spend index) names the spend → spent by it
   - else exactly one candidate spender `mined` per `getStatusForTxids` → spent by it
   - else no candidate on the network and the output's own tx is mined → unspent
   - anything else (pending wallet spend, spend seen but not mined, unconfirmed output) → unresolved, left untouched

### Apply

1. Full `processSyncChunk` pass local → remote, then remote → local. User rows are not sent, so `activeStorage` never changes.
2. Write each verdict onto the local output row (`updateOutput`, fresh `updated_at`), then an incremental pass carries it to the remote.
3. Re-read both stores; expect no one-sided records and every verdict matched on both sides.

Writes use sync state keyed as `<storageIdentityKey>~reconcile`, so the incremental sync state `WalletStorageManager` keeps for the real store pair is never touched. The whole run holds the storage sync lock.

### Record

The last run is saved under `storageReconcileLastRun` in `chrome.storage.local`: one-sided keys per side, push counts, each spend conflict with its verdict, corrected outpoints, and the post-apply check. Keys and verdicts only. No upload.

## Code

- `src/services/storageReconcile.ts`: indexing, diff, verdicts (unit tested)
- `src/services/storageReconcileBackground.ts`: reads, pushes, corrections, record
- `processStorageRepairSync` in `src/background.ts` calls it; active storage is left as configured
