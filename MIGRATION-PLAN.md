# Migration Plan: yours-wallet from spv-store to 1sat-wallet-toolbox

## Executive Summary

This document outlines the migration from `spv-store` to `1sat-wallet-toolbox` in the yours-wallet browser extension. The migration uses `OneSatWallet` directly without unnecessary wrappers.

### Key Architectural Changes

| Aspect               | Current (spv-store)               | New (1sat-wallet-toolbox)                     |
| -------------------- | --------------------------------- | --------------------------------------------- |
| **Wallet Lifecycle** | Single resident instance          | Read-only (long-lived) + Signing (on-demand)  |
| **Sync Model**       | Background service worker polling | UI-triggered SSE streaming                    |
| **Key Handling**     | External (Chrome storage)         | Injected at construction                      |
| **Query API**        | `search(TxoLookup)`               | `listOutputs({ basket, tags })`               |
| **Data Storage**     | Custom IndexedDB                  | BRC-100 WalletStorageManager                  |
| **Tx Fetching**      | `getTx(txid)`                     | `wallet.loadTx(txid)`                         |
| **Broadcast**        | `broadcast(tx)`                   | `wallet.broadcast(tx, desc)` → `IngestResult` |

### Design Decisions

1. **No WalletManager wrapper** - Use `OneSatWallet` directly throughout
2. **Read-only wallet** is long-lived (for balance queries, viewing UTXOs)
3. **Signing wallet** instantiated only when needed for transactions (shares storage)
4. **Clean sync** - delete old IndexedDB, sync fresh (no data migration)
5. **UI-triggered sync only** - no background service worker sync

---

## Output Data Pattern

### Two-Phase Data Access

The toolbox uses a two-phase pattern for accessing output data:

1. **List Phase** - `wallet.listOutputs({ basket, tags })` returns `WalletOutput[]`
   - Lightweight objects with: `outpoint`, `satoshis`, `spendable`, `tags`, `labels`
   - Use for listing, filtering, aggregating
   - Pass around as arrays without parsing

2. **Parse Phase** - `wallet.loadTxo(outpoint)` returns `Txo`
   - Full parsed data including `txo.data['bsv21']`, `txo.data['origin']`, etc.
   - Call only when you need to consume/display the detailed data
   - Avoids N+1 parsing when just listing outputs

### Key Types

| Type           | Source                 | Usage                                     |
| -------------- | ---------------------- | ----------------------------------------- |
| `WalletOutput` | `listOutputs()` result | Lightweight, for lists and filtering      |
| `Txo`          | `loadTxo(outpoint)`    | Full parsed data, for display/consumption |

### Example Usage

```typescript
// List BSV21 tokens for a specific id
const result = await wallet.listOutputs({
  basket: 'bsv21',
  tags: [`id:${tokenId}`],
});

// Just need outpoints for a transaction? Use WalletOutput directly
const outpoints = result.outputs.map((o) => o.outpoint);

// Need to display token details? Parse when needed
for (const output of result.outputs) {
  const txo = await wallet.loadTxo(output.outpoint);
  const bsv21Data = txo.data?.bsv21?.data; // { id, sym, amt, icon, dec }
  // render token info...
}
```

### BSV20 → BSV21 Migration

- BSV20 is now BSV21 in the new system
- `tickOrId` → just `id`
- Token data accessed via `txo.data['bsv21']` which contains: `id`, `sym`, `amt`, `icon`, `dec`
- Query specific token: `wallet.listOutputs({ basket: 'bsv21', tags: ['id:${tokenId}'] })`

---

## Placeholders & Incomplete Implementations

These are issues in already-migrated code that need resolution:

### P1: Lock Data Not Parsed ✅

**File:** `Bsv.service.ts:93`
**Code:** `lock: undefined as { until: number } | undefined`
**Impact:** Lock feature broken - users cannot see/unlock locked coins
**Status:** RESOLVED - Using `Lock.decode()` from `@bsv/templates` to parse locking script directly

### P2: Owner Not Available from listOutputs ✅

**File:** `Bsv.service.ts:415`
**Code:** `owner: undefined as string | undefined`
**Impact:** `sendBsv()`, `sendAllBsv()`, `fundRawTx()` cannot match private keys to UTXOs
**Status:** RESOLVED - Using `parseAddress()` from `@1sat/wallet-toolbox` to extract owner from P2PKH script. Also fixed basket from `'default'` to `'fund'`.

### P3: Ordinal Pagination Not Implemented ✅

**File:** `Ordinal.service.ts:70-71`
**Code:** `from: ''`
**Impact:** Pagination broken for users with many ordinals
**Status:** RESOLVED - Using `offset` parameter in `listOutputs()` and `totalOutputs` from result to calculate next page

### P4: Block Height Not Available (Low Priority)

**File:** `providerHelper.ts:89`
**Code:** `height: 0, idx: 0`
**Impact:** Ordinal metadata incomplete (not actively used in UI)
**Status:** DEFERRED - Will be addressed as part of Ordinal type replacement

### P5: walletAdapters.ts Txo Property Access Bug ✅

**File:** `src/utils/walletAdapters.ts`
**Status:** RESOLVED - File was never created. Type adapters were handled inline or via `mapOrdinal()` in providerHelper.ts

### P6: N+1 Query Pattern in Ordinal Fetching ✅

**File:** `Ordinal.service.ts:39-69` and `background.ts:513-560`
**Code:** `getOrdinals()` calls `wallet.listOutputs()` then `wallet.parse(txid)` for EACH output
**Impact:** Performance - many network/parse calls for users with many ordinals
**Status:** RESOLVED - Use two-phase pattern: `listOutputs()` returns `WalletOutput[]` for listing, `loadTxo(outpoint)` only when parsing is needed for display/consumption

### P7: setDerivationTags() Disabled

**File:** `src/services/serviceHelpers.ts`
**Impact:** Derivation tags (panda/yours tags) not being set after unlock
**Used by:** `UnlockWallet.tsx`, `GenerateTaggedKeysRequest.tsx`
**Status:** DEFERRED - Needs rewrite to use `wallet.listOutputs()` + `wallet.parse()` to find tag inscriptions

### P8: LockTemplate Duplicated

**File:** `src/services/Contract.service.ts:10-82`
**Impact:** Code duplication - LockTemplate class copied from spv-store
**Status:** DEFERRED - Should be moved to `@bsv/templates` or `@1sat/wallet-toolbox`

### P9: MNEE Sync Disabled

**File:** `src/utils/mneeIndexer.ts`
**Impact:** MNEE transactions may not sync automatically (relies on 1Sat API indexing them)
**Status:** DEFERRED - `fetchMNEETransactions()` helper available for manual sync

---

## Build Status ✅

**Build compiles successfully** - All spv-store imports have been removed. TypeScript compilation passes with no errors.

---

## GorillaPoolService Removal

`GorillaPoolService` is being **deleted entirely**. All references must be updated:

### Replacements

| Old (GorillaPoolService)                   | New (wallet-toolbox)                                    |
| ------------------------------------------ | ------------------------------------------------------- |
| `gorillaPoolService.getBaseUrl(network)`   | `wallet.services.baseUrl`                               |
| `gorillaPoolService.getUtxoByOutpoint()`   | `wallet.parseTransaction(txid)` → get `Txo` from result |
| `gorillaPoolService.getBsv20Balances()`    | Sum `txo.data['bsv21'].amt` from `wallet.listOutputs()` |
| `gorillaPoolService.getBSV20Utxos()`       | `wallet.listOutputs()` filtered by bsv21 tag            |
| `gorillaPoolService.getBsv20Details()`     | Token data from `txo.data['bsv21']`                     |
| `gorillaPoolService.getTokenPriceInSats()` | TODO: Needs external price API or remove feature        |

### BSV20 → BSV21 Migration

- BSV20 is now BSV21 in the new system
- `tickOrId` → just `id`
- Token data comes from `txo.data['bsv21']` which has `id`, `amt`, etc.

---

## Ordinal Type Replacement Plan

The `Ordinal` type from `yours-wallet-provider` is a legacy type that maps poorly to the toolbox's `Txo`/`ParseContext` model. Rather than maintain complex adapters, we should replace `Ordinal` usage with `Txo` from the toolbox.

### Current `Ordinal` Type Usage

| Location                                | Usage                                             | Replacement Strategy                          |
| --------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| **Services**                            |                                                   |                                               |
| `Ordinal.service.ts`                    | `getOrdinals()`, `getOrdinal()` return `Txo`      | ✅ Done                                       |
| `GorillaPool.service.ts`                | `getUtxoByOutpoint()` returns `Ordinal`           | DELETE - use `wallet.parseTransaction()`      |
| **Components**                          |                                                   |                                               |
| `components/Ordinal.tsx`                | Display component takes `Txo`                     | ✅ Done                                       |
| `components/TxPreview.tsx`              | Uses `mapOrdinal()` to convert `Txo` → `Ordinal`  | Use `Txo` directly                            |
| **Pages**                               |                                                   |                                               |
| `pages/OrdWallet.tsx`                   | Main ordinals page, heavy `Ordinal` usage         | 🔄 In Progress - update to use `Txo`          |
| `pages/requests/OrdTransferRequest.tsx` | Transfer request UI                               | Update to use `Txo`                           |
| `pages/requests/OrdPurchaseRequest.tsx` | Purchase request UI                               | Update to use `Txo`                           |
| **Background/Provider**                 |                                                   |                                               |
| `background.ts`                         | `processGetOrdinalsRequest()` uses `mapOrdinal()` | Keep `Ordinal` for external API compatibility |
| `inject.ts`                             | Provider API methods                              | Keep `Ordinal` for external API compatibility |
| **Utils**                               |                                                   |                                               |
| `providerHelper.ts`                     | `mapOrdinal()` converts `Txo` → `Ordinal`         | Keep for provider API, simplify internal use  |

### Migration Strategy

1. **Internal code**: Replace `Ordinal` with `Txo` from `@1sat/wallet-toolbox`
2. **Provider API**: Keep `mapOrdinal()` for external-facing API compatibility
3. **UI Components**: Update to work with `Txo` structure directly

### Key Type Differences

| Field    | `Ordinal` (yours-wallet-provider)             | `Txo` (@1sat/wallet-toolbox)                  |
| -------- | --------------------------------------------- | --------------------------------------------- |
| Outpoint | `txid`, `vout`, `outpoint` (string)           | `outpoint: Outpoint` object (.toString())     |
| Satoshis | `satoshis: number`                            | `output.satoshis: number`                     |
| Script   | `script: string` (hex)                        | `output.lockingScript: Script`                |
| Owner    | `owner?: string`                              | `owner?: string`                              |
| Data     | `data: { insc?, list?, lock?, map?, bsv20? }` | `data: { [tag]: IndexData }`                  |
| Origin   | `origin?: { outpoint, data }`                 | `data.origin?.data`                           |
| Height   | `height: number`, `idx: number`               | Not available (use external lookup if needed) |

---

## Migration Progress

### Build Status ✅

**TypeScript compiles clean** - No spv-store imports remain. All core migration work is complete.

### Completed ✅

| File                                          | Status                                                   |
| --------------------------------------------- | -------------------------------------------------------- |
| `src/initWallet.ts`                           | ✅ Created (replaces initSPVStore.ts)                    |
| `src/initSPVStore.ts`                         | ✅ Deleted                                               |
| `src/background.ts`                           | ✅ Updated to use `walletPromise` and `OneSatWallet`     |
| `src/services/Bsv.service.ts`                 | ✅ Fully migrated                                        |
| `src/services/Contract.service.ts`            | ✅ Fully migrated                                        |
| `src/services/Keys.service.ts`                | ✅ Fully migrated                                        |
| `src/services/Ordinal.service.ts`             | ✅ Fully migrated                                        |
| `src/services/GorillaPool.service.ts`         | ✅ DELETED                                               |
| `src/services/serviceHelpers.ts`              | ✅ Removed spv-store import (setDerivationTags deferred) |
| `src/utils/providerHelper.ts`                 | ✅ Updated mapOrdinal() for toolbox Txo                  |
| `src/utils/masterExporter.ts`                 | ✅ Disabled (throws "temporarily unavailable")           |
| `src/utils/masterImporter.ts`                 | ✅ Disabled (throws "temporarily unavailable")           |
| `src/utils/mneeIndexer.ts`                    | ✅ Commented out class, kept fetchMNEETransactions()     |
| `src/contexts/ServiceContext.ts`              | ✅ Updated to use `wallet: OneSatWallet`                 |
| `src/contexts/providers/ServiceProvider.tsx`  | ✅ Updated (removed gorillaPoolService)                  |
| `src/components/FaucetButton.tsx`             | ✅ Migrated to wallet.ingest()                           |
| `src/components/TopNav.tsx`                   | ✅ Migrated to wallet.close()                            |
| `src/components/TxPreview.tsx`                | ✅ Migrated to toolbox types                             |
| `src/components/Bsv20TokensList.tsx`          | ✅ Uses wallet.services.baseUrl                          |
| `src/components/SendBsv20View.tsx`            | ✅ Uses wallet.services.baseUrl                          |
| `src/components/ManageTokens.tsx`             | ✅ Uses wallet.services.baseUrl                          |
| `src/pages/OrdWallet.tsx`                     | ✅ Uses wallet.listOutputs/loadTxo directly              |
| `src/pages/AppsAndTools.tsx`                  | ✅ Migrated to toolbox types                             |
| `src/pages/BsvWallet.tsx`                     | ✅ Migrated                                              |
| `src/pages/Settings.tsx`                      | ✅ Migrated to wallet.close()/syncAll()                  |
| `src/pages/requests/OrdTransferRequest.tsx`   | ✅ Uses wallet.loadTxo()                                 |
| `src/pages/requests/OrdPurchaseRequest.tsx`   | ✅ Uses wallet.loadTxo()                                 |
| `src/pages/requests/Bsv20SendRequest.tsx`     | ✅ Gets token info from wallet tags                      |
| `src/pages/requests/BroadcastRequest.tsx`     | ✅ Migrated to toolbox types                             |
| `src/pages/requests/BsvSendRequest.tsx`       | ✅ Migrated to toolbox types                             |
| `src/pages/requests/GetSignaturesRequest.tsx` | ✅ Migrated to toolbox types                             |

### Temporarily Disabled Features 🔄

| Feature             | File                                 | Status                                               |
| ------------------- | ------------------------------------ | ---------------------------------------------------- |
| `getOrdinals` API   | `src/background.ts:512`              | Commented out - TODO to re-enable when ready         |
| Transaction History | `src/components/TxHistory.tsx`       | Uses local TxLog type, returns empty array - TODO    |
| Master Backup       | `src/utils/masterExporter.ts`        | Throws "temporarily unavailable" - TODO              |
| Master Restore      | `src/utils/masterImporter.ts`        | Throws "temporarily unavailable" - TODO              |
| Derivation Tags     | `src/services/serviceHelpers.ts`     | setDerivationTags() removed - TODO to rewrite        |
| Token Prices        | `src/components/Bsv20TokensList.tsx` | getTokenPriceInSats() removed - TODO to re-implement |

### Dead Code Removed

| File                                  | Status     |
| ------------------------------------- | ---------- |
| `src/services/GorillaPool.service.ts` | ✅ DELETED |

### Files Kept (with TODOs)

| File                             | Purpose                                               |
| -------------------------------- | ----------------------------------------------------- |
| `src/utils/providerHelper.ts`    | `mapOrdinal()` - needed for future getOrdinals API    |
| `src/utils/masterExporter.ts`    | Stub - backup feature to be re-implemented            |
| `src/utils/masterImporter.ts`    | Stub - restore feature to be re-implemented           |
| `src/utils/mneeIndexer.ts`       | `fetchMNEETransactions()` helper for manual MNEE sync |
| `src/services/serviceHelpers.ts` | `deepMerge()` used by ChromeStorage                   |

### Migration Strategy - COMPLETE ✅

All spv-store types and methods have been replaced. The following mappings were used:

#### Types Replaced

| spv-store Type | Replacement                                   |
| -------------- | --------------------------------------------- |
| `IndexContext` | `ParseContext` from `@1sat/wallet-toolbox`    |
| `Txo`          | `Txo` from `@1sat/wallet-toolbox`             |
| `TxLog`        | Local type definition in TxHistory.tsx        |
| `ParseMode`    | Not needed - ingest() handles this internally |

#### Methods Replaced

| spv-store Method                         | Replacement                                              |
| ---------------------------------------- | -------------------------------------------------------- |
| `oneSatSPV.parseTx(tx)`                  | `wallet.parse(txid)` after broadcast                     |
| `oneSatSPV.broadcast(tx, label)`         | `wallet.broadcast(tx, description)`                      |
| `oneSatSPV.stores.txos?.ingest(tx,...)`  | `wallet.ingest(tx, description)`                         |
| `oneSatSPV.getRecentTxs()`               | **DEFERRED** - TxHistory shows empty                     |
| `oneSatSPV.getChaintip()`                | `wallet.services.getHeight()`                            |
| `oneSatSPV.destroy()`                    | `wallet.close()`                                         |
| `oneSatSPV.sync(force)`                  | `wallet.syncAll()`                                       |
| `oneSatSPV.stores.txos?.syncTxLogs()`    | Not needed or `wallet.syncAll()`                         |
| `oneSatSPV.stores.txos?.refreshSpends()` | Not needed - handled by sync                             |
| `setDerivationTags(keys, oneSatSPV)`     | **DEFERRED** - needs rewrite to use wallet.listOutputs() |

---

## Current Architecture Analysis

### spv-store Usage in yours-wallet

**Initialization:** `src/initSPVStore.ts`

- Creates `OneSatWebSPV` instance with indexers, owners, network
- Registers event listeners for sync status updates
- Returns promise that resolves to SPVStore instance

**Global Residence:** `src/background.ts:57-82`

```typescript
export let oneSatSPVPromise = chromeStorageService.getAndSetStorage().then(async (storage) => {
  return initOneSatSPV(chromeStorageService, isInServiceWorker);
});
```

- SPVStore lives as global promise in service worker
- Stays resident throughout extension lifecycle
- Account switching requires `destroy()` and recreate

**APIs Currently Used:**
| Method | Usage Location |
|--------|----------------|
| `search(TxoLookup, TxoSort)` | Bsv.service.ts, Ordinal.service.ts |
| `getTx(txid)` | Bsv.service.ts, Keys.service.ts |
| `getTxo(Outpoint)` | Ordinal.service.ts |
| `getTxos(Outpoint[])` | Ordinal.service.ts |
| `broadcast(tx)` | Bsv.service.ts |
| `sync()` | background.ts |
| `destroy()` | background.ts |
| `getSyncedBlock()` | Bsv.service.ts |
| `backupTxos()`, `restoreTxos()` | masterExporter.ts, masterImporter.ts |

### Key Separation

Keys are already stored separately from SPVStore:

- Encrypted in Chrome local storage (`account.encryptedKeys`)
- Decrypted only when needed via `KeysService.retrieveKeys(password)`
- SPVStore only handles UTXOs and transaction data

---

## 1sat-wallet-toolbox Interface

### OneSatWallet Class

```typescript
interface OneSatWalletArgs {
  rootKey: string | PrivateKey;    // Public key hex (read-only) OR PrivateKey (signing)
  storage: WalletStorageManager;   // IndexedDB storage
  chain: Chain;                    // 'main' or 'test'
  owners?: Set<string>;            // Addresses to filter outputs
  indexers?: Indexer[];            // Custom indexers
  autoSync?: boolean;              // Auto-sync on construction
}

class OneSatWallet extends Wallet {
  get readOnly(): boolean;

  // Transaction operations
  ingestTransaction(tx, description, labels?): Promise<IngestResult>;
  broadcast(tx, description, labels?): Promise<InternalizeActionResult>;
  parseTransaction(txid): Promise<ParseResult>;

  // Sync
  syncAddress(address): void;      // SSE-based streaming
  syncAll(): void;
  stopSync(address): void;

  // Inherited from Wallet (BRC-100)
  listOutputs({ basket?, tags?, limit?, offset? }): Promise<TableOutput[]>;
  listActions({ limit? }): Promise<Action[]>;

  // Lifecycle
  close(): void;
}
```

### Read-Only vs Signing Mode

**Read-Only (public key only):**

```typescript
const wallet = new OneSatWallet({
  rootKey: identityPubKeyHex, // String = read-only mode
  storage,
  chain: 'main',
  owners: new Set([bsvAddr, ordAddr, identityAddr]),
});
// Can query, sync, but NOT sign
```

**Signing (private key):**

```typescript
const wallet = new OneSatWallet({
  rootKey: privateKey, // PrivateKey object = signing mode
  storage,
  chain: 'main',
  owners: new Set([bsvAddr, ordAddr, identityAddr]),
});
// Full signing capability
```

---

## Migration Implementation

### Phase 1: Core Infrastructure

#### 1.1 Update Dependencies

**File:** `package.json`

```diff
- "spv-store": "^0.1.86",
+ "1sat-wallet-toolbox": "link:../1sat-wallet-toolbox",
```

#### 1.2 Create Wallet Manager

**New File:** `src/walletManager.ts`

```typescript
import { OneSatWallet, type OneSatWalletArgs } from '1sat-wallet-toolbox';
import { WalletStorageManager, StorageIdb } from '@bsv/wallet-toolbox/mobile';
import type { Chain } from '@bsv/wallet-toolbox/mobile/out/src/sdk/types';
import type { PrivateKey } from '@bsv/sdk';
import type { Indexer } from '1sat-wallet-toolbox';

export interface WalletManagerArgs {
  accountId: string;
  chain: Chain;
  owners: Set<string>;
  identityPubKey: string;
  indexers?: Indexer[];
}

export class WalletManager {
  private storage: WalletStorageManager;
  private readOnlyWallet: OneSatWallet | null = null;
  private args: WalletManagerArgs;

  constructor(args: WalletManagerArgs) {
    this.args = args;
    this.storage = new WalletStorageManager(new StorageIdb(`wallet-${args.accountId}`));
  }

  /**
   * Get or create long-lived read-only wallet for queries
   */
  getReadOnlyWallet(): OneSatWallet {
    if (!this.readOnlyWallet) {
      this.readOnlyWallet = new OneSatWallet({
        rootKey: this.args.identityPubKey, // Public key = read-only
        storage: this.storage,
        chain: this.args.chain,
        owners: this.args.owners,
        indexers: this.args.indexers,
      });
    }
    return this.readOnlyWallet;
  }

  /**
   * Create short-lived signing wallet for transactions
   * Caller should call close() when done
   */
  createSigningWallet(privateKey: PrivateKey): OneSatWallet {
    return new OneSatWallet({
      rootKey: privateKey, // Private key = signing mode
      storage: this.storage, // Shared storage
      chain: this.args.chain,
      owners: this.args.owners,
      indexers: this.args.indexers,
    });
  }

  /**
   * Trigger sync for all owner addresses
   */
  syncAll(): void {
    const wallet = this.getReadOnlyWallet();
    wallet.syncAll();
  }

  /**
   * Cleanup all resources
   */
  close(): void {
    if (this.readOnlyWallet) {
      this.readOnlyWallet.close();
      this.readOnlyWallet = null;
    }
  }
}
```

#### 1.3 Replace initSPVStore.ts

**File:** `src/initSPVStore.ts` → rename to `src/initWallet.ts`

```typescript
import { WalletManager } from './walletManager';
import { ChromeStorageService } from './services/ChromeStorage.service';
import { NetWork } from 'yours-wallet-provider';
import { getIndexers, getOwners } from './indexerConfig'; // Extract existing logic

export const initWalletManager = async (chromeStorageService: ChromeStorageService): Promise<WalletManager> => {
  const { selectedAccount, account } = chromeStorageService.getCurrentAccountObject();
  const network = chromeStorageService.getNetwork();
  const chain = network === NetWork.Mainnet ? 'main' : 'test';

  const owners = getOwners(chromeStorageService);
  const indexers = getIndexers(owners, network);

  return new WalletManager({
    accountId: selectedAccount || '',
    chain,
    owners,
    identityPubKey: account?.pubKeys?.identityPubKey || '',
    indexers,
  });
};
```

---

### Phase 2: Background Script Updates

**File:** `src/background.ts`

#### 2.1 Replace Global Promise

```typescript
// Migration version - increment to trigger clean sync
const MIGRATION_VERSION = 5;

export let walletManagerPromise = chromeStorageService.getAndSetStorage().then(async (storage) => {
  // Migrate from spv-store on first run after update
  if (storage?.version && storage.version < MIGRATION_VERSION) {
    await migrateFromSpvStore();
    await chromeStorageService.update({ version: MIGRATION_VERSION });
  }
  return initWalletManager(chromeStorageService);
});

async function migrateFromSpvStore() {
  console.log('Migrating from spv-store: deleting old IndexedDB databases');
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name && (db.name.startsWith('txos-') || db.name.startsWith('txn-') || db.name.startsWith('block-'))) {
      indexedDB.deleteDatabase(db.name);
      console.log(`Deleted database: ${db.name}`);
    }
  }
}
```

#### 2.2 Update Account Switching

```typescript
const switchAccount = async () => {
  // Close old wallet manager
  (await walletManagerPromise).close();

  // Create new for new account
  chromeStorageService = new ChromeStorageService();
  await chromeStorageService.getAndSetStorage();
  walletManagerPromise = initWalletManager(chromeStorageService);
};
```

#### 2.3 Update Sign Out

```typescript
const signOut = async () => {
  (await walletManagerPromise).close();
  await deleteAllIDBDatabases(); // Keep existing cleanup
};
```

#### 2.4 Remove Background Sync

Delete automatic sync triggers - sync will be UI-triggered only.

---

### Phase 3: Service Layer Migration

#### 3.1 Bsv.service.ts

**File:** `src/services/Bsv.service.ts`

**Constructor:**

```typescript
constructor(
  private readonly keysService: KeysService,
  private readonly wocService: WhatsOnChainService,
  private readonly contractService: ContractService,
  private readonly chromeStorageService: ChromeStorageService,
  private readonly walletManager: WalletManager,  // Changed from oneSatSPV: SPVStore
) {}
```

**Method Updates:**

```typescript
// fundingTxos() - Line 406-409
fundingTxos = async () => {
  const wallet = this.walletManager.getReadOnlyWallet();
  const outputs = await wallet.listOutputs({ basket: 'fund' });
  return outputs.map(tableOutputToTxo); // Use adapter
};

// getLockedTxos() - Line 84-87
getLockedTxos = async () => {
  const wallet = this.walletManager.getReadOnlyWallet();
  const outputs = await wallet.listOutputs({ basket: 'lock' });
  return outputs.map(tableOutputToTxo).filter((txo) => !txo.data.insc);
};

// getCurrentHeight() - Line 79-82
getCurrentHeight = async () => {
  const wallet = this.walletManager.getReadOnlyWallet();
  return await wallet.services.getHeight();
};

// Source transaction retrieval (used in sendBsv, fundRawTx, etc.)
// Replace: const sourceTransaction = await this.oneSatSPV.getTx(txid);
// With:
const wallet = this.walletManager.getReadOnlyWallet();
const rawResult = await wallet.services.getRawTx(txid);
const sourceTransaction = Transaction.fromBinary(rawResult.rawTx!);

// Broadcast (line 289, 151)
// For sending transactions, create a signing wallet
const signingWallet = this.walletManager.createSigningWallet(privateKey);
try {
  await signingWallet.broadcast(tx, 'Send BSV');
} finally {
  signingWallet.close();
}
```

#### 3.2 Ordinal.service.ts

**File:** `src/services/Ordinal.service.ts`

```typescript
// getOrdinals()
getOrdinals = async (from?: string) => {
  const wallet = this.walletManager.getReadOnlyWallet();
  const offset = from ? parseInt(from) : 0;
  const outputs = await wallet.listOutputs({
    basket: '1sat',
    limit: 50,
    offset,
  });
  return {
    ordinals: outputs.map(tableOutputToOrdinal),
    from: (offset + outputs.length).toString(),
  };
};

// getOrdinal() - single lookup
getOrdinal = async (outpoint: string) => {
  const [txid, voutStr] = outpoint.split('_');
  const vout = parseInt(voutStr);
  const wallet = this.walletManager.getReadOnlyWallet();

  const output = await wallet.storage.runAsStorageProvider(async (sp) => {
    const outputs = await sp.findOutputs({ partial: { txid, vout } });
    return outputs[0];
  });

  return tableOutputToOrdinal(output);
};
```

#### 3.3 Contract.service.ts

**File:** `src/services/Contract.service.ts`

Update constructor and replace `oneSatSPV.getTx()` calls similarly.

#### 3.4 Keys.service.ts

**File:** `src/services/Keys.service.ts`

Replace `getTx()` calls with `services.getRawTx()`.

---

### Phase 4: Data Adapters

**New File:** `src/utils/walletAdapters.ts`

```typescript
import type { TableOutput } from '@bsv/wallet-toolbox/mobile';

// Legacy Txo type for compatibility
export interface LegacyTxo {
  outpoint: { txid: string; vout: number };
  satoshis: bigint;
  script: number[];
  owner?: string;
  data: Record<string, any>;
}

export function tableOutputToTxo(output: TableOutput): LegacyTxo {
  const customData = parseCustomInstructions(output.customInstructions);
  return {
    outpoint: { txid: output.txid, vout: output.vout },
    satoshis: BigInt(output.satoshis),
    script: output.lockingScript,
    owner: customData.owner,
    data: customData,
  };
}

export function tableOutputToOrdinal(output: TableOutput): Ordinal {
  const customData = parseCustomInstructions(output.customInstructions);
  return {
    txid: output.txid,
    vout: output.vout,
    outpoint: `${output.txid}_${output.vout}`,
    satoshis: output.satoshis,
    origin: customData.origin,
    data: {
      insc: customData.insc,
      map: customData.map,
      list: customData.list,
      bsv20: customData.bsv20,
    },
  };
}

function parseCustomInstructions(instructions?: string): Record<string, any> {
  if (!instructions) return {};
  try {
    return JSON.parse(instructions);
  } catch {
    return {};
  }
}
```

---

### Phase 5: Context and Provider Updates

#### 5.1 ServiceContext.ts

**File:** `src/contexts/ServiceContext.ts`

```typescript
export interface ServiceContextProps {
  // ... existing props
  walletManager: WalletManager; // Changed from oneSatSPV: SPVStore
}
```

#### 5.2 ServiceProvider.tsx

**File:** `src/contexts/providers/ServiceProvider.tsx`

```typescript
const initializeServices = async () => {
  const walletManager = await walletManagerPromise;

  const keysService = new KeysService(chromeStorageService, walletManager);
  const contractService = new ContractService(keysService, walletManager);
  const bsvService = new BsvService(
    keysService,
    wocService,
    contractService,
    chromeStorageService,
    walletManager
  );
  const ordinalService = new OrdinalService(
    keysService,
    bsvService,
    walletManager,
    chromeStorageService,
    gorillaPoolService
  );

  return { walletManager, keysService, bsvService, ordinalService, ... };
};
```

---

### Phase 6: UI Sync Triggers

Since sync is UI-triggered only, add sync button/trigger:

```typescript
// In a React component
const handleSync = () => {
  walletManager.syncAll();
};

// Subscribe to sync events for progress
useEffect(() => {
  const wallet = walletManager.getReadOnlyWallet();

  wallet.services.on('sync:start', ({ address }) => {
    setIsSyncing(true);
  });

  wallet.services.on('sync:parsed', ({ txid, internalizedCount }) => {
    if (internalizedCount > 0) {
      // Show notification, update balance
    }
  });

  wallet.services.on('sync:complete', ({ address }) => {
    setIsSyncing(false);
  });

  return () => {
    // Cleanup event listeners
  };
}, [walletManager]);
```

---

### Phase 7: Backup/Restore

**Recommendation:** Temporarily disable backup/restore functionality.

The `backupTxos()`, `backupTxLogs()`, `backupTxns()` and corresponding restore methods from spv-store don't have direct equivalents in wallet-toolbox.

**Options:**

1. **Disable** - Remove from UI until toolbox provides backup APIs
2. **Rewrite** - Use storage provider's `findOutputs()` and `findTransactions()` to export data manually

For initial migration, recommend option 1.

**Files to update:**

- `src/utils/masterExporter.ts` - Comment out or remove
- `src/utils/masterImporter.ts` - Comment out or remove

---

## API Mapping Reference

| spv-store                                    | 1sat-wallet-toolbox                                   |
| -------------------------------------------- | ----------------------------------------------------- |
| `search(new TxoLookup('fund'), TxoSort.ASC)` | `wallet.listOutputs({ basket: 'fund' })`              |
| `search(new TxoLookup('lock'))`              | `wallet.listOutputs({ basket: 'lock' })`              |
| `search(new TxoLookup('origin', 'type'))`    | `wallet.listOutputs({ basket: '1sat' })`              |
| `getTx(txid)`                                | `wallet.loadTx(txid)` → `Promise<Transaction>`        |
| `getTxo(new Outpoint(outpoint))`             | `wallet.parse(txid)` → `ParseContext` with txos       |
| `getTxos(outpoints)`                         | Loop over `wallet.parse(txid)`                        |
| `broadcast(tx)`                              | `wallet.broadcast(tx, desc)` → `IngestResult`         |
| `stores.txos.ingest(tx)`                     | `wallet.ingestTransaction(tx, desc)` → `IngestResult` |
| `sync()`                                     | `wallet.syncAll()`                                    |
| `destroy()`                                  | `wallet.close()`                                      |
| `getSyncedBlock()`                           | `wallet.services.getHeight()`                         |
| `getChaintip()`                              | `wallet.services.getHeight()`                         |
| Events: `queueStats`                         | N/A (remove)                                          |
| Events: `importing`                          | `wallet.on('sync:start', cb)`                         |
| Events: `fetchingTx`                         | `wallet.on('sync:output', cb)`                        |
| Events: `syncedBlockHeight`                  | `wallet.on('sync:complete', cb)`                      |
| Events: `newTxs`                             | `wallet.on('sync:parsed', cb)`                        |

---

## Basket/Tag Mapping

| spv-store TxoLookup | 1sat-wallet-toolbox basket |
| ------------------- | -------------------------- |
| `'fund'`            | `'default'`                |
| `'lock'`            | `'lock'`                   |
| `'origin'`          | `'1sat'`                   |
| `'bsv21'`           | `'bsv21'`                  |
| `'bsv20'`           | N/A (use GorillaPool API)  |

---

## Files Summary

| File                                         | Action                                | Complexity |
| -------------------------------------------- | ------------------------------------- | ---------- |
| `package.json`                               | Update dependencies                   | Low        |
| `src/walletManager.ts`                       | **NEW**                               | Medium     |
| `src/initWallet.ts`                          | **NEW** (replaces initSPVStore.ts)    | Medium     |
| `src/initSPVStore.ts`                        | Delete                                | -          |
| `src/background.ts`                          | Modify global promise, remove bg sync | Medium     |
| `src/services/Bsv.service.ts`                | Heavy modifications                   | High       |
| `src/services/Ordinal.service.ts`            | Query changes                         | Medium     |
| `src/services/Contract.service.ts`           | Minor updates                         | Low        |
| `src/services/Keys.service.ts`               | Replace getTx()                       | Low        |
| `src/contexts/ServiceContext.ts`             | Type change                           | Low        |
| `src/contexts/providers/ServiceProvider.tsx` | Wire up manager                       | Medium     |
| `src/utils/walletAdapters.ts`                | **NEW**                               | Low        |
| `src/utils/masterExporter.ts`                | Disable/remove                        | Low        |
| `src/utils/masterImporter.ts`                | Disable/remove                        | Low        |

---

## Testing Checklist

- [ ] Fresh install - wallet creates new storage
- [ ] Upgrade from spv-store - old databases deleted, clean sync
- [ ] Balance query - shows correct BSV balance
- [ ] Send BSV - transaction broadcasts successfully
- [ ] Receive BSV - sync picks up incoming transaction
- [ ] View ordinals - lists all owned ordinals
- [ ] Transfer ordinal - sends ordinal successfully
- [ ] Lock/unlock - time-locked coins work
- [ ] Account switching - cleans up and reinitializes
- [ ] Sign out - all data cleared

---

## Risks and Mitigations

| Risk                       | Mitigation                                                   |
| -------------------------- | ------------------------------------------------------------ |
| Data loss on upgrade       | Users will need to re-sync (intentional clean sync)          |
| Different indexer behavior | Test thoroughly, compare outputs                             |
| Missing APIs               | Some features may need workarounds or removal                |
| Performance differences    | SSE sync may be faster for incremental, slower for full sync |
| Backup/restore broken      | Disable temporarily, communicate to users                    |

---

## Transaction Fetching Requirements

yours-wallet needs to fetch transactions in several contexts. Each has different requirements:

### Context 1: Building Transaction Inputs (sourceTransaction)

**Locations:**

- `Bsv.service.ts:128` - Building send BSV transaction
- `Bsv.service.ts:270` - Building funded transaction
- `Bsv.service.ts:450` - Adding funding inputs
- `Contract.service.ts:198` - Unlocking locked coins
- `Keys.service.ts:138,189` - Sweeping legacy/WIF wallets
- `Ordinal.service.ts:129,167` - Building ordinal transfer

**Requirement:** Need full `Transaction` object with outputs to:

1. Add as `input.sourceTransaction` for signing
2. Access `sourceTransaction.outputs[vout].satoshis` for fee calculation

**Current pattern:**

```typescript
const sourceTransaction = await this.walletManager.getTx(u.txid);
tx.addInput({
  sourceTransaction,
  sourceOutputIndex: u.vout,
  unlockingScriptTemplate: new P2PKH().unlock(pk),
});
```

**Solution:** Use `wallet.loadTx(txid)` - checks local storage first, falls back to network, returns `Transaction`.

### Context 2: Parsing External Transactions (User Broadcast)

**Locations:**

- `AppsAndTools.tsx:275,308` - Manual broadcast tool
- `BroadcastRequest.tsx:53,132` - External app broadcast request
- `BsvSendRequest.tsx:107` - After send, parse result
- `GetSignaturesRequest.tsx:89` - Parse tx for signing

**Requirement:** Parse raw hex/BEEF provided by user/app into `Transaction` for display or signing.

**Current pattern:**

```typescript
const tx = getTxFromRawTxFormat(rawTx, format); // handles 'tx', 'beef', 'ef'
```

**This is NOT fetching from network** - it's parsing user-provided data. No change needed.

### Context 3: Faucet Transaction Ingestion

**Location:** `FaucetButton.tsx:31-32`

**Requirement:** Parse faucet response hex and ingest into wallet.

**Current pattern:**

```typescript
const tx = Transaction.fromHex(response.raw);
await oneSatSPV.stores.txos?.ingest(tx, 'faucet', ParseMode.Persist);
```

**New pattern:**

```typescript
const tx = Transaction.fromHex(response.raw);
await wallet.ingestTransaction(tx, 'faucet');
```

### Context 4: Fund Transaction Inputs from Local Wallet

**Locations:**

- `Bsv.service.ts:435` - `fundRawTx()` needs source txs for inputs

**Requirement:** For each input in a partially-built transaction, fetch the source transaction to enable signing.

**Current pattern:**

```typescript
for (const input of tx.inputs) {
  input.sourceTransaction = await this.walletManager.getTx(input.sourceTXID ?? '');
  satsIn += input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis || 0;
}
```

**Answer:** Use `services.getRawTx(txid)` - it checks local storage first via `storage.runAsStorageProvider(sp => sp.getRawTxOfKnownValidTransaction(txid))`, then falls back to network via `beef.getRaw(txid)`. Returns `{ txid, name, rawTx?, error? }`.

---

## OneSatWallet API Summary

Based on the interface cleanup, here's what yours-wallet should use:

### 1. Load Transaction by TXID

**Method:** `wallet.loadTx(txid): Promise<Transaction>`

```typescript
async loadTx(txid: string): Promise<Transaction> {
  // Check local storage first
  const rawTxResult = await this.services.getRawTx(txid);
  if (rawTxResult.rawTx) {
    return Transaction.fromBinary(rawTxResult.rawTx);
  }
  // Fall back to network
  const beefBytes = await this.services.beef.getBeef(txid);
  return Transaction.fromBEEF(Array.from(beefBytes));
}
```

**Usage:**

```typescript
const sourceTransaction = await wallet.loadTx(txid);
tx.addInput({ sourceTransaction, sourceOutputIndex: vout, ... });
```

### 2. Get Current Block Height

**Method:** `wallet.services.getHeight(): Promise<number>`

### 3. Broadcast Transaction

**Method:** `wallet.broadcast(tx, description): Promise<IngestResult>`

Returns `IngestResult` which contains:

```typescript
interface IngestResult {
  parseContext: ParseContext; // includes txid, tx, txos, spends, summary
  internalizedCount: number;
}
```

**Usage:**

```typescript
const result = await wallet.broadcast(tx, 'Send BSV');
return { txid: result.parseContext.txid };
```

### 4. List Outputs

**Method:** `wallet.listOutputs({ basket, limit?, offset? }): Promise<ListOutputsResult>`

### 5. Ingest External Transaction

**Method:** `wallet.ingestTransaction(tx, description): Promise<IngestResult>`

### 6. Sync

**Method:** `wallet.syncAll()` or `wallet.syncAddress(address)`

---

## Questions to Consider

1. **MNEEIndexer** - spv-store has a custom MNEE indexer. Does 1sat-wallet-toolbox support MNEE tokens?
2. **Bsv20Indexer** - spv-store has Bsv20Indexer, toolbox only has Bsv21Indexer. Is BSV20 still needed?
3. **Sync progress UI** - How should sync progress be displayed without background sync?
4. **Error handling** - What happens if sync fails mid-way?
