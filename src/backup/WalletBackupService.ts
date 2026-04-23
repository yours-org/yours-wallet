import {
  FileRestoreReader,
  Zip,
  ZipDeflate,
  type BackupManifest,
  type BackupProgressCallback,
} from '@1sat/wallet-browser';
import { encode } from '@msgpack/msgpack';
import type { WalletStorageManager, sdk } from '@bsv/wallet-toolbox-mobile';
import type { ChromeStorageService } from '../services/ChromeStorage.service';
import type { Account } from '../services/types/chromeStorage.types';
import type { Theme } from '../theme.types';
import { decrypt, deriveKey } from '../utils/crypto';

type Chain = 'main' | 'test';
type SyncChunk = sdk.SyncChunk;
type RequestSyncChunkArgs = sdk.RequestSyncChunkArgs;

// ── v2 multi-account manifest types ──────────────────────────────

export interface AccountManifestEntry {
  identityKey: string;
  identityAddress: string;
  name: string;
  chunkCount: number;
}

export interface BackupManifestV2 {
  version: 2;
  createdAt: string;
  chain: Chain;
  accounts: AccountManifestEntry[];
}

/** Union of v1 (single-account) and v2 (multi-account) manifests. */
export type AnyBackupManifest = BackupManifest | BackupManifestV2;

/** Progress event emitted during multi-account backup. */
export interface MultiAccountProgressEvent {
  stage: 'preparing' | 'exporting' | 'complete' | 'error';
  accountName?: string;
  accountIndex?: number;
  totalAccounts?: number;
  message: string;
}

/** Account descriptor passed into exportAllAccounts. */
export interface BackupAccountDescriptor {
  identityKey: string;
  identityAddress: string;
  name: string;
}

/** Sentinel manifest for legacy (pre-BRC-100) SPV-store backups that have no manifest.json. */
export interface BackupManifestLegacy {
  version: 0;
  createdAt: string;
  chain: Chain;
  /** Legacy backups have no wallet-toolbox chunks — keys only. */
  keysOnly: true;
}

export type AnyBackupManifestOrLegacy = AnyBackupManifest | BackupManifestLegacy;

function isV2Manifest(m: AnyBackupManifest): m is BackupManifestV2 {
  return m.version === 2;
}

/**
 * Chrome storage shape from legacy (pre-BRC-100) backups.
 * These include the full ChromeStorageObject with passKey embedded.
 */
interface LegacyChromeStorage {
  accounts: Record<string, Account>;
  selectedAccount: string;
  accountNumber: number;
  salt: string;
  passKey?: string;
  colorTheme?: Theme;
  version?: number;
  hasUpgradedToSPV?: boolean;
  [key: string]: unknown;
}

/**
 * Entity names in the order expected by getSyncChunk.
 * Must match the chunkers array in wallet-toolbox-mobile.
 */
const SYNC_ENTITY_NAMES = [
  'provenTx',
  'outputBasket',
  'outputTag',
  'txLabel',
  'transaction',
  'output',
  'txLabelMap',
  'outputTagMap',
  'certificate',
  'certificateField',
  'commission',
  'provenTxReq',
] as const;

/**
 * Create initial offsets array for getSyncChunk.
 * All offsets start at 0 to read from the beginning.
 */
function createInitialOffsets(): Array<{ name: string; offset: number }> {
  return SYNC_ENTITY_NAMES.map((name) => ({ name, offset: 0 }));
}

/**
 * Chrome storage data to include in backup.
 * Excludes passKey (derived from password) and transient session data.
 */
interface BackupChromeStorage {
  accounts: Record<string, Account>;
  selectedAccount: string;
  accountNumber: number;
  salt: string;
  colorTheme?: Theme;
  showWelcome?: boolean;
  deviceId?: string;
  version?: number;
}

/**
 * Check if a SyncChunk has any data.
 */
function chunkHasData(chunk: SyncChunk): boolean {
  return Boolean(
    (chunk.provenTxs && chunk.provenTxs.length > 0) ||
    (chunk.provenTxReqs && chunk.provenTxReqs.length > 0) ||
    (chunk.outputBaskets && chunk.outputBaskets.length > 0) ||
    (chunk.txLabels && chunk.txLabels.length > 0) ||
    (chunk.outputTags && chunk.outputTags.length > 0) ||
    (chunk.transactions && chunk.transactions.length > 0) ||
    (chunk.txLabelMaps && chunk.txLabelMaps.length > 0) ||
    (chunk.commissions && chunk.commissions.length > 0) ||
    (chunk.outputs && chunk.outputs.length > 0) ||
    (chunk.outputTagMaps && chunk.outputTagMaps.length > 0) ||
    (chunk.certificates && chunk.certificates.length > 0) ||
    (chunk.certificateFields && chunk.certificateFields.length > 0),
  );
}

/**
 * Per-account pending restore data stored in IndexedDB.
 * Keyed by identityKey so each account's data can be imported independently
 * when that account becomes the active wallet.
 *
 * `syncFromReader` enforces that the identityKey matches the authenticated
 * wallet, so we must import one account at a time as each is activated.
 */
interface AccountPendingRestore {
  manifest: BackupManifest; // v1-shaped manifest for FileRestoreReader
  chunks: Record<string, Uint8Array>; // flat chunk keys (chunk-XXXX.bin)
  chunkCount: number;
}

// IndexedDB name for storing pending restore data
const PENDING_RESTORE_DB = 'yours-wallet-pending-restore';
const PENDING_RESTORE_STORE = 'pending';

/**
 * WalletBackupService orchestrates backup/restore operations for the wallet.
 *
 * For BACKUP: Directly reads sync chunks from storage using runAsSync/getSyncChunk,
 * avoiding the need for a complex provider that tracks sync state.
 *
 * For RESTORE (two-phase):
 * 1. restoreChromeStorage: Restores accounts/settings when no wallet exists
 * 2. importPendingWalletData: Called after unlock to import wallet data
 */
export class WalletBackupService {
  /**
   * Export wallet data for ALL accounts to a single ZIP file (v2 format).
   *
   * All accounts share one IndexedDB, partitioned by identityKey. We call
   * getSyncChunk on the same storage instance with each account's identityKey
   * — no need to create additional wallet instances.
   *
   * ZIP layout:
   *   manifest.json              — v2 manifest with per-account metadata
   *   chromeStorage.json         — all accounts' encrypted keys & settings
   *   settings.bin               — storage settings
   *   <identityAddress>/chunk-XXXX.bin — per-account wallet data chunks
   */
  static async exportAllAccounts(
    storage: WalletStorageManager,
    chromeStorageService: ChromeStorageService,
    chain: Chain,
    accounts: BackupAccountDescriptor[],
    onProgress: (event: MultiAccountProgressEvent) => void,
  ): Promise<Blob> {
    onProgress({ stage: 'preparing', message: 'Preparing backup...', totalAccounts: accounts.length });

    const zipChunks: Uint8Array[] = [];
    let zipError: Error | null = null;

    const zip = new Zip((err, data) => {
      if (err) {
        zipError = err;
        return;
      }
      zipChunks.push(data);
    });

    const settings = storage.getSettings();
    const storageIdentityKey = settings.storageIdentityKey;
    const fileBackupStorageKey = 'file-backup-' + Date.now();

    const accountManifestEntries: AccountManifestEntry[] = [];

    // Export each account's wallet data
    for (let acctIdx = 0; acctIdx < accounts.length; acctIdx++) {
      const acct = accounts[acctIdx];

      onProgress({
        stage: 'exporting',
        accountName: acct.name,
        accountIndex: acctIdx,
        totalAccounts: accounts.length,
        message: `Backing up "${acct.name}" (${acctIdx + 1} of ${accounts.length})...`,
      });

      let chunkCount = 0;
      let offsets = createInitialOffsets();

      for (;;) {
        const args: RequestSyncChunkArgs = {
          identityKey: acct.identityKey,
          fromStorageIdentityKey: storageIdentityKey,
          toStorageIdentityKey: fileBackupStorageKey,
          since: undefined,
          maxRoughSize: 10000000,
          maxItems: 1000,
          offsets,
        };

        const chunk = await storage.runAsSync(async (sync) => sync.getSyncChunk(args));

        const chunkName = `${acct.identityAddress}/chunk-${String(chunkCount).padStart(4, '0')}.bin`;
        const encoded = encode(chunk);
        const deflate = new ZipDeflate(chunkName, { level: 6 });
        zip.add(deflate);
        deflate.push(new Uint8Array(encoded), true);

        chunkCount++;

        if (!chunkHasData(chunk)) break;

        const entityCounts: Record<string, number> = {
          provenTx: chunk.provenTxs?.length ?? 0,
          outputBasket: chunk.outputBaskets?.length ?? 0,
          outputTag: chunk.outputTags?.length ?? 0,
          txLabel: chunk.txLabels?.length ?? 0,
          transaction: chunk.transactions?.length ?? 0,
          output: chunk.outputs?.length ?? 0,
          txLabelMap: chunk.txLabelMaps?.length ?? 0,
          outputTagMap: chunk.outputTagMaps?.length ?? 0,
          certificate: chunk.certificates?.length ?? 0,
          certificateField: chunk.certificateFields?.length ?? 0,
          commission: chunk.commissions?.length ?? 0,
          provenTxReq: chunk.provenTxReqs?.length ?? 0,
        };

        offsets = offsets.map((o) => ({
          name: o.name,
          offset: o.offset + (entityCounts[o.name] ?? 0),
        }));
      }

      if (zipError) throw zipError;

      accountManifestEntries.push({
        identityKey: acct.identityKey,
        identityAddress: acct.identityAddress,
        name: acct.name,
        chunkCount,
      });
    }

    // Add Chrome storage data (all accounts' keys & settings)
    onProgress({
      stage: 'exporting',
      message: 'Exporting account settings...',
      totalAccounts: accounts.length,
    });
    const chromeStorage = await chromeStorageService.getAndSetStorage();
    const backupChromeStorage: BackupChromeStorage = {
      accounts: chromeStorage?.accounts || {},
      selectedAccount: chromeStorage?.selectedAccount || '',
      accountNumber: chromeStorage?.accountNumber || 1,
      salt: chromeStorage?.salt || '',
      colorTheme: chromeStorage?.colorTheme,
      showWelcome: chromeStorage?.showWelcome,
      deviceId: chromeStorage?.deviceId,
      version: chromeStorage?.version,
    };

    const chromeStorageDeflate = new ZipDeflate('chromeStorage.json', { level: 6 });
    zip.add(chromeStorageDeflate);
    chromeStorageDeflate.push(new TextEncoder().encode(JSON.stringify(backupChromeStorage, null, 2)), true);

    // Add settings
    const settingsDeflate = new ZipDeflate('settings.bin', { level: 6 });
    zip.add(settingsDeflate);
    settingsDeflate.push(new Uint8Array(encode(settings)), true);

    // Create v2 manifest
    const manifest: BackupManifestV2 = {
      version: 2,
      createdAt: new Date().toISOString(),
      chain,
      accounts: accountManifestEntries,
    };

    const manifestDeflate = new ZipDeflate('manifest.json', { level: 6 });
    zip.add(manifestDeflate);
    manifestDeflate.push(new TextEncoder().encode(JSON.stringify(manifest, null, 2)), true);

    zip.end();
    if (zipError) throw zipError;

    onProgress({ stage: 'complete', message: 'Backup complete!', totalAccounts: accounts.length });

    return new Blob(zipChunks as unknown as BlobPart[], { type: 'application/zip' });
  }

  // ============================================================
  // TWO-PHASE RESTORE (for when no wallet exists)
  // ============================================================

  /**
   * Phase 1: Restore from pre-extracted backup data.
   *
   * The popup decompresses the ZIP (where Web Workers are available) and sends
   * only the entries the background needs. This method never touches the raw ZIP.
   *
   * For legacy backups: only chromeStorage is provided (keys-only restore).
   * For v1/v2 backups: chromeStorage + manifest + settings + chunks are provided.
   */
  static async restoreFromExtractedData(
    chromeStorageService: ChromeStorageService,
    data: {
      chromeStorage: Uint8Array;
      manifest?: Uint8Array;
      settings?: Uint8Array;
      chunks?: Record<string, Uint8Array>;
      isLegacy: boolean;
    },
    password: string,
    onProgress: BackupProgressCallback,
  ): Promise<AnyBackupManifestOrLegacy> {
    // Parse chromeStorage (shared by all formats)
    const chromeStorageJson = new TextDecoder().decode(data.chromeStorage);

    if (data.isLegacy) {
      // ── Legacy restore (keys only) ──────────────────────────────
      onProgress({ stage: 'importing', message: 'Detected older backup format. Restoring account keys...' });

      const legacyStorage = JSON.parse(chromeStorageJson) as LegacyChromeStorage;
      const passKey = this.verifyPasswordAndDeriveKey(legacyStorage, password);

      onProgress({ stage: 'importing', message: 'Restoring account settings...' });

      await chromeStorageService.update({
        accounts: legacyStorage.accounts,
        selectedAccount: legacyStorage.selectedAccount,
        accountNumber: legacyStorage.accountNumber,
        salt: legacyStorage.salt,
        passKey,
        colorTheme: legacyStorage.colorTheme,
        version: legacyStorage.version,
        lastActiveTime: Date.now(),
      });

      console.log('[WalletBackupService] Legacy backup restored (keys only).');
      onProgress({ stage: 'complete', message: 'Keys restored! Wallet data will sync on first unlock.' });

      return { version: 0, createdAt: new Date().toISOString(), chain: 'main', keysOnly: true };
    }

    // ── v1/v2 restore ──────────────────────────────────────────
    if (!data.manifest || !data.settings || !data.chunks) {
      throw new Error('Invalid restore data: missing manifest, settings, or chunks');
    }

    const manifest = JSON.parse(new TextDecoder().decode(data.manifest)) as AnyBackupManifest;
    if (manifest.version !== 1 && manifest.version !== 2) {
      throw new Error(`Unsupported backup version: ${(manifest as { version: number }).version}`);
    }

    const backupChromeStorage = JSON.parse(chromeStorageJson) as BackupChromeStorage;
    const passKey = this.verifyPasswordAndDeriveKey(backupChromeStorage, password);

    onProgress({ stage: 'importing', message: 'Restoring account settings...' });

    await chromeStorageService.update({
      accounts: backupChromeStorage.accounts,
      selectedAccount: backupChromeStorage.selectedAccount,
      accountNumber: backupChromeStorage.accountNumber,
      salt: backupChromeStorage.salt,
      passKey,
      colorTheme: backupChromeStorage.colorTheme,
      showWelcome: backupChromeStorage.showWelcome,
      deviceId: backupChromeStorage.deviceId,
      version: backupChromeStorage.version,
      lastActiveTime: Date.now(),
    });

    // Store wallet data chunks in IndexedDB per-account for Phase 2 import.
    // syncFromReader enforces identityKey === authenticated wallet, so each
    // account's data is stored separately and imported when that account is active.
    onProgress({ stage: 'importing', message: 'Storing wallet data for import...' });

    if (isV2Manifest(manifest)) {
      for (const acct of manifest.accounts) {
        const flatChunks: Record<string, Uint8Array> = {};
        for (let i = 0; i < acct.chunkCount; i++) {
          const namespacedKey = `${acct.identityAddress}/chunk-${String(i).padStart(4, '0')}.bin`;
          const flatKey = `chunk-${String(i).padStart(4, '0')}.bin`;
          if (data.chunks[namespacedKey]) {
            flatChunks[flatKey] = data.chunks[namespacedKey];
          }
        }
        const v1Compat: BackupManifest = {
          version: 1,
          createdAt: manifest.createdAt,
          chain: manifest.chain,
          identityKey: acct.identityKey,
          chunkCount: acct.chunkCount,
        };
        await this.storeAccountPendingRestore(acct.identityKey, {
          manifest: v1Compat,
          chunks: flatChunks,
          chunkCount: acct.chunkCount,
        });
        console.log(
          `[WalletBackupService] Stored pending data for "${acct.name}" (${Object.keys(flatChunks).length} chunks)`,
        );
      }
    } else {
      // v1: single account — chunks have flat keys already
      await this.storeAccountPendingRestore(manifest.identityKey, {
        manifest,
        chunks: data.chunks,
        chunkCount: manifest.chunkCount,
      });
      console.log(
        `[WalletBackupService] Stored pending data for v1 account (${Object.keys(data.chunks).length} chunks)`,
      );
    }

    console.log('[WalletBackupService] All pending restore data stored successfully');
    onProgress({ stage: 'complete', message: 'Restore complete! Initializing wallet...' });

    return manifest;
  }

  /**
   * Verify the password against the backup's encrypted keys and return the derived passKey.
   */
  private static verifyPasswordAndDeriveKey(
    storage: { salt: string; accounts: Record<string, Account>; selectedAccount: string },
    password: string,
  ): string {
    const { salt, accounts, selectedAccount } = storage;
    if (!salt) {
      throw new Error('Invalid backup file: missing salt');
    }

    const passKey = deriveKey(password, salt);

    const account = accounts[selectedAccount];
    if (!account?.encryptedKeys) {
      throw new Error('Invalid backup file: missing encrypted keys');
    }

    try {
      const decryptedKeys = decrypt(account.encryptedKeys, passKey);
      JSON.parse(decryptedKeys);
    } catch {
      throw new Error('Invalid password - unable to decrypt wallet keys');
    }

    return passKey;
  }

  /**
   * Phase 2: Import pending wallet data for the CURRENT account after unlock.
   *
   * syncFromReader enforces that identityKey matches the authenticated wallet,
   * so we can only import one account at a time. Pending data for other accounts
   * stays in IndexedDB until those accounts are activated (switched to).
   *
   * Called from initializeWallet() on every wallet init — including account switches.
   *
   * @param storage - WalletStorageManager instance (initialized for current account)
   * @param identityKey - The current account's identity public key
   * @param onProgress - Progress callback
   */
  static async importPendingWalletData(
    storage: WalletStorageManager,
    identityKey: string,
    onProgress: BackupProgressCallback,
  ): Promise<void> {
    const pending = await this.getAccountPendingRestore(identityKey);
    if (!pending) {
      return;
    }

    onProgress({
      stage: 'importing',
      message: `Importing wallet data (${pending.chunkCount} chunks)...`,
    });

    const reader = new FileRestoreReader(pending.chunks, pending.manifest);
    await storage.syncFromReader(identityKey, reader);

    // Remove only this account's pending data — others stay for when they're activated
    await this.clearAccountPendingRestore(identityKey);

    onProgress({ stage: 'complete', message: 'Wallet data imported!' });
  }

  /**
   * Check if there's pending wallet data for a specific account.
   */
  static async hasPendingRestore(identityKey: string): Promise<boolean> {
    const pending = await this.getAccountPendingRestore(identityKey);
    return pending !== null;
  }

  // ── Per-account IndexedDB storage ────────────────────────────

  private static async storeAccountPendingRestore(identityKey: string, data: AccountPendingRestore): Promise<void> {
    const db = await this.openPendingRestoreDB();
    const tx = db.transaction(PENDING_RESTORE_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_RESTORE_STORE);
    await new Promise<void>((resolve, reject) => {
      const request = store.put(data, identityKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
  }

  private static async getAccountPendingRestore(identityKey: string): Promise<AccountPendingRestore | null> {
    try {
      const db = await this.openPendingRestoreDB();
      const tx = db.transaction(PENDING_RESTORE_STORE, 'readonly');
      const store = tx.objectStore(PENDING_RESTORE_STORE);
      const result = await new Promise<AccountPendingRestore | undefined>((resolve, reject) => {
        const request = store.get(identityKey);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return result ?? null;
    } catch {
      return null;
    }
  }

  private static async clearAccountPendingRestore(identityKey: string): Promise<void> {
    try {
      const db = await this.openPendingRestoreDB();
      const tx = db.transaction(PENDING_RESTORE_STORE, 'readwrite');
      const store = tx.objectStore(PENDING_RESTORE_STORE);
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(identityKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      db.close();
    } catch {
      // Ignore errors
    }
  }

  /**
   * Clear ALL pending restore data (e.g. on unrecoverable error).
   */
  static async clearAllPendingRestores(): Promise<void> {
    try {
      const db = await this.openPendingRestoreDB();
      const tx = db.transaction(PENDING_RESTORE_STORE, 'readwrite');
      const store = tx.objectStore(PENDING_RESTORE_STORE);
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      db.close();
    } catch {
      // Ignore errors
    }
  }

  private static openPendingRestoreDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(PENDING_RESTORE_DB, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PENDING_RESTORE_STORE)) {
          db.createObjectStore(PENDING_RESTORE_STORE);
        }
      };
    });
  }
}
