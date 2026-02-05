import {
  FileRestoreReader,
  Zip,
  ZipDeflate,
  unzip,
  type BackupManifest,
  type BackupProgressCallback,
  type Unzipped,
} from '@1sat/wallet/browser';
import { encode } from '@msgpack/msgpack';
import type {
  WalletStorageManager,
  sdk,
} from '@bsv/wallet-toolbox-mobile';
import type { ChromeStorageService } from '../services/ChromeStorage.service';
import type { Account, Theme } from '../services/types/chromeStorage.types';
import { decrypt, deriveKey } from '../utils/crypto';

type Chain = 'main' | 'test';
type SyncChunk = sdk.SyncChunk;
type RequestSyncChunkArgs = sdk.RequestSyncChunkArgs;

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
  return (
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
    (chunk.certificateFields && chunk.certificateFields.length > 0)
  );
}

/**
 * Pending restore data stored in IndexedDB for import after wallet unlock.
 */
interface PendingRestore {
  manifest: BackupManifest;
  chunks: Record<string, Uint8Array>;
  settings: Uint8Array;
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
   * Export wallet data to a ZIP file.
   *
   * Approach: Directly call getSyncChunk on the storage in a loop to read all data,
   * rather than using syncToWriter (which requires a full provider implementation
   * with sync state tracking).
   *
   * @param storage - WalletStorageManager instance
   * @param chromeStorageService - Chrome storage service for account data
   * @param chain - Network chain (main or test)
   * @param identityKey - Wallet identity public key
   * @param onProgress - Progress callback
   * @returns Blob containing the ZIP file
   */
  static async exportToFile(
    storage: WalletStorageManager,
    chromeStorageService: ChromeStorageService,
    chain: Chain,
    identityKey: string,
    onProgress: BackupProgressCallback,
  ): Promise<Blob> {
    onProgress({ stage: 'preparing', message: 'Preparing backup...' });

    // Collect ZIP data in memory
    const zipChunks: Uint8Array[] = [];
    let zipError: Error | null = null;

    const zip = new Zip((err, data) => {
      if (err) {
        zipError = err;
        return;
      }
      zipChunks.push(data);
    });

    onProgress({ stage: 'exporting', message: 'Exporting wallet data...' });

    const settings = storage.getSettings();
    const storageIdentityKey = settings.storageIdentityKey;

    // Create initial request args for full export (since: undefined = all data)
    // We use a fake "file-backup" target storage identity key
    const fileBackupStorageKey = 'file-backup-' + Date.now();

    let chunkCount = 0;
    let offsets = createInitialOffsets();

    // Read chunks directly from storage
    for (;;) {
      const args: RequestSyncChunkArgs = {
        identityKey,
        fromStorageIdentityKey: storageIdentityKey,
        toStorageIdentityKey: fileBackupStorageKey,
        since: undefined, // undefined = all data (not incremental)
        maxRoughSize: 10000000, // 10MB per chunk
        maxItems: 1000,
        offsets,
      };

      // Use runAsSync to get a chunk from the active storage
      const chunk = await storage.runAsSync(async (sync) => sync.getSyncChunk(args));

      // Write chunk to ZIP
      const chunkName = `chunk-${String(chunkCount).padStart(4, '0')}.bin`;
      const encoded = encode(chunk);
      const deflate = new ZipDeflate(chunkName, { level: 6 });
      zip.add(deflate);
      deflate.push(new Uint8Array(encoded), true);

      chunkCount++;

      // Check if done (no more data)
      if (!chunkHasData(chunk)) {
        break;
      }

      // Update offsets based on items returned in this chunk
      // This allows reading more data in subsequent iterations if needed
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

      // Update offsets for next iteration
      offsets = offsets.map((o) => ({
        name: o.name,
        offset: o.offset + (entityCounts[o.name] ?? 0),
      }));
    }

    if (zipError) throw zipError;

    onProgress({
      stage: 'exporting',
      message: `Exported ${chunkCount} data chunks`,
    });

    // Add Chrome storage data
    onProgress({ stage: 'exporting', message: 'Exporting account settings...' });
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
    chromeStorageDeflate.push(
      new TextEncoder().encode(JSON.stringify(backupChromeStorage, null, 2)),
      true,
    );

    // Add settings
    const settingsDeflate = new ZipDeflate('settings.bin', { level: 6 });
    zip.add(settingsDeflate);
    settingsDeflate.push(new Uint8Array(encode(settings)), true);

    // Create and add manifest
    const manifest: BackupManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      chain,
      identityKey,
      chunkCount,
    };

    const manifestDeflate = new ZipDeflate('manifest.json', { level: 6 });
    zip.add(manifestDeflate);
    manifestDeflate.push(
      new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
      true,
    );

    // Finalize the ZIP
    zip.end();

    if (zipError) throw zipError;

    onProgress({ stage: 'complete', message: 'Backup complete!' });

    return new Blob(zipChunks, { type: 'application/zip' });
  }

  /**
   * Validate a backup file without importing it.
   *
   * @param file - ZIP file to validate
   * @returns The backup manifest if valid
   */
  static async validateBackupFile(file: File): Promise<BackupManifest> {
    const zipData = new Uint8Array(await file.arrayBuffer());
    const unzipped = await new Promise<Unzipped>((resolve, reject) => {
      unzip(zipData, (err, data) => (err ? reject(err) : resolve(data)));
    });

    const manifestData = unzipped['manifest.json'];
    if (!manifestData) {
      throw new Error('Invalid backup file: missing manifest.json');
    }

    const manifest = JSON.parse(
      new TextDecoder().decode(manifestData),
    ) as BackupManifest;

    if (manifest.version !== 1) {
      throw new Error(`Unsupported backup version: ${manifest.version}`);
    }

    // Verify all chunks exist
    for (let i = 0; i < manifest.chunkCount; i++) {
      const chunkName = `chunk-${String(i).padStart(4, '0')}.bin`;
      if (!unzipped[chunkName]) {
        throw new Error(`Invalid backup file: missing ${chunkName}`);
      }
    }

    return manifest;
  }

  // ============================================================
  // TWO-PHASE RESTORE (for when no wallet exists)
  // ============================================================

  /**
   * Phase 1: Restore Chrome storage and store wallet data for later import.
   * Validates password by decrypting keys, then stores everything including passKey.
   *
   * @param chromeStorageService - Chrome storage service
   * @param file - Backup ZIP file
   * @param password - User's password to verify and derive passKey
   * @param onProgress - Progress callback
   * @returns The backup manifest
   */
  static async restoreChromeStorage(
    chromeStorageService: ChromeStorageService,
    file: File,
    password: string,
    onProgress: BackupProgressCallback,
  ): Promise<BackupManifest> {
    onProgress({ stage: 'uploading', message: 'Reading backup file...' });

    // Read and unzip the file
    const zipData = new Uint8Array(await file.arrayBuffer());
    const unzipped = await new Promise<Unzipped>((resolve, reject) => {
      unzip(zipData, (err, data) => (err ? reject(err) : resolve(data)));
    });

    // Read and validate manifest
    const manifestData = unzipped['manifest.json'];
    if (!manifestData) {
      throw new Error('Invalid backup file: missing manifest.json');
    }

    const manifest = JSON.parse(
      new TextDecoder().decode(manifestData),
    ) as BackupManifest;

    if (manifest.version !== 1) {
      throw new Error(`Unsupported backup version: ${manifest.version}`);
    }

    // Restore Chrome storage (replaces any existing data)
    onProgress({ stage: 'importing', message: 'Restoring account settings...' });
    const chromeStorageData = unzipped['chromeStorage.json'];
    if (!chromeStorageData) {
      throw new Error('Invalid backup file: missing chromeStorage.json');
    }

    const backupChromeStorage = JSON.parse(
      new TextDecoder().decode(chromeStorageData),
    ) as BackupChromeStorage;

    // Verify password by deriving passKey and decrypting keys
    onProgress({ stage: 'importing', message: 'Verifying password...' });
    const { salt, accounts, selectedAccount } = backupChromeStorage;
    if (!salt) {
      throw new Error('Invalid backup file: missing salt');
    }

    // Derive passKey from password + salt
    const passKey = deriveKey(password, salt);

    // Verify by decrypting the selected account's keys
    const account = accounts[selectedAccount];
    if (!account?.encryptedKeys) {
      throw new Error('Invalid backup file: missing encrypted keys');
    }

    try {
      const decryptedKeys = decrypt(account.encryptedKeys, passKey);
      // Verify it's valid JSON
      JSON.parse(decryptedKeys);
    } catch {
      throw new Error('Invalid password - unable to decrypt wallet keys');
    }

    // Password verified - save everything including passKey
    await chromeStorageService.update({
      accounts: backupChromeStorage.accounts,
      selectedAccount: backupChromeStorage.selectedAccount,
      accountNumber: backupChromeStorage.accountNumber,
      salt: backupChromeStorage.salt,
      passKey, // Include the derived passKey so user is authenticated
      colorTheme: backupChromeStorage.colorTheme,
      showWelcome: backupChromeStorage.showWelcome,
      deviceId: backupChromeStorage.deviceId,
      version: backupChromeStorage.version,
      lastActiveTime: Date.now(), // Mark as recently active
    });

    // Store wallet data chunks in IndexedDB for later import
    onProgress({ stage: 'importing', message: 'Storing wallet data for import...' });
    const chunks: Record<string, Uint8Array> = {};
    for (let i = 0; i < manifest.chunkCount; i++) {
      const chunkName = `chunk-${String(i).padStart(4, '0')}.bin`;
      if (unzipped[chunkName]) {
        chunks[chunkName] = unzipped[chunkName];
      }
    }

    const settingsData = unzipped['settings.bin'];
    if (!settingsData) {
      throw new Error('Invalid backup file: missing settings.bin');
    }

    console.log('[WalletBackupService] Storing pending restore data in IndexedDB...');
    console.log('[WalletBackupService] Chunks to store:', Object.keys(chunks).length);
    await this.storePendingRestore({
      manifest,
      chunks,
      settings: settingsData,
    });
    console.log('[WalletBackupService] Pending restore data stored successfully');

    // Verify it was stored
    const verifyPending = await this.hasPendingRestore();
    console.log('[WalletBackupService] Verify hasPendingRestore:', verifyPending);

    onProgress({ stage: 'complete', message: 'Restore complete! Initializing wallet...' });

    return manifest;
  }

  /**
   * Phase 2: Import pending wallet data after unlock.
   * Call this after the wallet has been initialized.
   *
   * @param storage - WalletStorageManager instance
   * @param onProgress - Progress callback
   * @returns The backup manifest, or null if no pending restore
   */
  static async importPendingWalletData(
    storage: WalletStorageManager,
    onProgress: BackupProgressCallback,
  ): Promise<BackupManifest | null> {
    const pending = await this.getPendingRestore();
    if (!pending) {
      return null;
    }

    onProgress({
      stage: 'importing',
      message: `Importing ${pending.manifest.chunkCount} data chunks...`,
    });

    // Create the restore reader and import wallet data
    const reader = new FileRestoreReader(pending.chunks, pending.manifest);
    await storage.syncFromReader(pending.manifest.identityKey, reader);

    // Clear pending restore
    await this.clearPendingRestore();

    onProgress({ stage: 'complete', message: 'Wallet restore complete!' });

    return pending.manifest;
  }

  /**
   * Check if there's pending wallet data to import.
   */
  static async hasPendingRestore(): Promise<boolean> {
    const pending = await this.getPendingRestore();
    return pending !== null;
  }

  /**
   * Store pending restore data in IndexedDB.
   */
  private static async storePendingRestore(data: PendingRestore): Promise<void> {
    const db = await this.openPendingRestoreDB();
    const tx = db.transaction(PENDING_RESTORE_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_RESTORE_STORE);
    await new Promise<void>((resolve, reject) => {
      const request = store.put(data, 'pending');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
  }

  /**
   * Get pending restore data from IndexedDB.
   */
  private static async getPendingRestore(): Promise<PendingRestore | null> {
    try {
      const db = await this.openPendingRestoreDB();
      const tx = db.transaction(PENDING_RESTORE_STORE, 'readonly');
      const store = tx.objectStore(PENDING_RESTORE_STORE);
      const result = await new Promise<PendingRestore | undefined>((resolve, reject) => {
        const request = store.get('pending');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return result ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Clear pending restore data.
   */
  static async clearPendingRestore(): Promise<void> {
    try {
      const db = await this.openPendingRestoreDB();
      const tx = db.transaction(PENDING_RESTORE_STORE, 'readwrite');
      const store = tx.objectStore(PENDING_RESTORE_STORE);
      await new Promise<void>((resolve, reject) => {
        const request = store.delete('pending');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      db.close();
    } catch {
      // Ignore errors
    }
  }

  /**
   * Open the pending restore IndexedDB.
   */
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
