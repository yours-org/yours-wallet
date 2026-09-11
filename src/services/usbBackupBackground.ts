/**
 * USB backup sync — the background's read-only view of wallet storage.
 *
 * All accounts share one IndexedDB database ("wallet"), partitioned by user,
 * so a single extra read-only provider can serve sync chunks for every
 * account without switching accounts or closing the live wallet. The popup
 * asks for chunks one at a time (USB_BACKUP_CHUNK) and writes them to the
 * drive; this module never touches the drive and never sees the backup key.
 */
import { StorageIdb, StorageProvider } from '@1sat/wallet-browser';
import type { sdk } from '@bsv/wallet-toolbox-client';
import { encode } from '@msgpack/msgpack';
import { bytesToBase64 } from '../utils/usbCrypto';

/** Passed to migrate(); the toolbox derives the real IndexedDB name from it plus the chain. */
const DATABASE_NAME = 'wallet';
const MAX_ROUGH_SIZE = 2_000_000;
const MAX_ITEMS = 500;

export const SYNC_ENTITY_NAMES = [
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

export type SyncOffsets = Array<{ name: string; offset: number }>;

export const initialOffsets = (): SyncOffsets => SYNC_ENTITY_NAMES.map((name) => ({ name, offset: 0 }));

export interface UsbBackupChunkRequest {
  identityKey: string;
  /** ISO timestamp; rows updated at or after it are returned. Absent = everything. */
  since?: string;
  offsets: SyncOffsets;
  toStorageIdentityKey: string;
}

export interface UsbBackupChunkResponse {
  success: boolean;
  error?: string;
  /** msgpack of the SyncChunk, base64. */
  chunkData?: string;
  /** Per-entity counts in this chunk, for advancing offsets. */
  counts?: Record<string, number>;
  /** Newest `updated_at` among the returned rows, ISO, or undefined if none. */
  newestUpdatedAt?: string;
  hasData?: boolean;
}

let reader: StorageIdb | null = null;
let readerSettings: Awaited<ReturnType<StorageIdb['makeAvailable']>> | null = null;
let opening: Promise<StorageIdb> | null = null;
/** Bumped by every close so an open that was in flight during a lock discards its result. */
let generation = 0;

const openReader = async (storageIdentityKey: string): Promise<StorageIdb> => {
  if (reader) return reader;
  if (opening) return opening;
  const gen = generation;
  opening = (async () => {
    const options = StorageProvider.createStorageBaseOptions('main');
    const idb = new StorageIdb(options);
    await idb.migrate(DATABASE_NAME, storageIdentityKey);
    const settings = await idb.makeAvailable();
    if (gen !== generation) {
      // Locked while opening: do not keep a connection past the lock.
      await idb.destroy().catch(() => {});
      throw new Error('Wallet is locked');
    }
    reader = idb;
    readerSettings = settings;
    return idb;
  })().finally(() => {
    opening = null;
  });
  return opening;
};

/** Drop the read-only connection (on lock or sign-out). Safe to call any time. */
export const closeUsbBackupReader = async (): Promise<void> => {
  generation++;
  const r = reader;
  reader = null;
  readerSettings = null;
  if (r) await r.destroy().catch(() => {});
};

const countRows = (chunk: sdk.SyncChunk): Record<string, number> => ({
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
});

const newestUpdatedAt = (chunk: sdk.SyncChunk): string | undefined => {
  let newest: number | undefined;
  const lists: Array<Array<{ updated_at?: Date | string }> | undefined> = [
    chunk.provenTxs,
    chunk.outputBaskets,
    chunk.outputTags,
    chunk.txLabels,
    chunk.transactions,
    chunk.outputs,
    chunk.txLabelMaps,
    chunk.outputTagMaps,
    chunk.certificates,
    chunk.certificateFields,
    chunk.commissions,
    chunk.provenTxReqs,
  ];
  for (const list of lists) {
    for (const row of list ?? []) {
      const t = row.updated_at ? new Date(row.updated_at).getTime() : NaN;
      if (!Number.isNaN(t) && (newest === undefined || t > newest)) newest = t;
    }
  }
  return newest === undefined ? undefined : new Date(newest).toISOString();
};

/**
 * Serve one sync chunk for any account from the shared local database.
 * `storageIdentityKey` is this install's per-device id (the same one the live
 * wallet uses), so the reader opens the same database the wallet writes.
 */
export const usbBackupChunk = async (
  storageIdentityKey: string,
  req: UsbBackupChunkRequest,
): Promise<UsbBackupChunkResponse> => {
  try {
    const idb = await openReader(storageIdentityKey);
    const args: sdk.RequestSyncChunkArgs = {
      identityKey: req.identityKey,
      fromStorageIdentityKey: readerSettings?.storageIdentityKey ?? storageIdentityKey,
      toStorageIdentityKey: req.toStorageIdentityKey,
      since: req.since ? new Date(req.since) : undefined,
      maxRoughSize: MAX_ROUGH_SIZE,
      maxItems: MAX_ITEMS,
      offsets: req.offsets,
    };
    const chunk = await idb.getSyncChunk(args);
    const counts = countRows(chunk);
    const hasData = Object.values(counts).some((n) => n > 0);
    return {
      success: true,
      chunkData: bytesToBase64(new Uint8Array(encode(chunk))),
      counts,
      newestUpdatedAt: newestUpdatedAt(chunk),
      hasData,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/** Storage settings (msgpack, base64) for the restore manifest. */
export const usbBackupSettings = async (
  storageIdentityKey: string,
): Promise<{ success: boolean; error?: string; settingsData?: string }> => {
  try {
    await openReader(storageIdentityKey);
    if (!readerSettings) throw new Error('Storage settings unavailable');
    return { success: true, settingsData: bytesToBase64(new Uint8Array(encode(readerSettings))) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};
