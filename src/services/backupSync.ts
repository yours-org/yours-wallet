import type { WalletStorageManager } from '@bsv/wallet-toolbox-client';

/**
 * Backup push: the active store is the source of truth, every other
 * registered store is a backup that is brought up to date from it.
 *
 * The toolbox only writes to the active store. With a remote active, the
 * local IndexedDB (and so the USB backup, which reads from it) receives
 * nothing unless something copies active → backups. The wallet factory has
 * a monitor task for that, but the monitor's `runOnce` returns before any
 * task when the active store is remote, and Yours never starts the task
 * loop. So the wallet drives the push itself: once after the address sync
 * on open, then on a timer (see initWallet).
 *
 * Each backup is isolated: one unreachable or billing-blocked remote must
 * not stop the others. A push is incremental: the toolbox pages rows by
 * `updated_at` from the writer's recorded checkpoint.
 */
export interface BackupPushResult {
  storageName: string;
  inserts: number;
  updates: number;
  error?: string;
}

/** True when a push copied or changed at least one row in some backup. */
export const pushChangedRows = (results: BackupPushResult[]): boolean =>
  results.some((r) => !r.error && r.inserts + r.updates > 0);

let inFlight: Promise<BackupPushResult[]> | undefined;

/** Push the active store to every backup store. Serialized: a call during a push waits for it and returns its result. */
export const pushBackups = (storage: WalletStorageManager): Promise<BackupPushResult[]> => {
  if (inFlight) return inFlight;
  inFlight = run(storage).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
};

const run = async (storage: WalletStorageManager): Promise<BackupPushResult[]> => {
  if (!storage.isActiveEnabled) return [];
  const backups = storage._backups ?? [];
  if (backups.length === 0) return [];
  const auth = await storage.getAuth();
  const results: BackupPushResult[] = [];
  for (const backup of backups) {
    const storageName = backup.settings?.storageName ?? backup.storage.constructor.name;
    try {
      const { inserts, updates } = await storage.syncToWriter(auth, backup.storage);
      results.push({ storageName, inserts, updates });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn(`[backupSync] push to ${storageName} failed:`, error);
      results.push({ storageName, inserts: 0, updates: 0, error });
    }
  }
  return results;
};

/** chrome.storage.local key holding the last backup push on this device, for Settings > Troubleshooting and DevTools. */
export const BACKUP_PUSH_RECORD_KEY = 'backupPushLastRun';

export interface BackupPushRecord {
  at: number;
  results: BackupPushResult[];
}

/** Persist the last push; a wallet with no backups records nothing. Never throws. */
export const recordBackupPush = async (results: BackupPushResult[]): Promise<void> => {
  if (results.length === 0) return;
  try {
    const record: BackupPushRecord = { at: Date.now(), results };
    await chrome.storage.local.set({ [BACKUP_PUSH_RECORD_KEY]: record });
  } catch (err) {
    console.warn('[backupSync] could not record the push:', err);
  }
};
