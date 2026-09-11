/**
 * USB backup sync — the popup-side loop (OPL-4685).
 *
 * Runs only while a page is open, unlocked, and a registered drive reads.
 * For each such drive it brings every account's wallet storage up to date on
 * the drive, incrementally: the toolbox's sync chunks with a `since` cursor,
 * msgpack, encrypted under a key derived from the session passKey. Stopping
 * at any point is safe: drive writes swap in on close, and the manifest on the
 * drive is the cursor of record.
 *
 * Layout on the drive (all under .yours/backup/):
 *   restore.json            plaintext: salt + USB wrappers, enough to rebuild the key
 *   manifest.enc            encrypted JSON: per-account cursor, chunk count, timestamps
 *   keys.enc                encrypted JSON: the chrome-storage subset restore needs
 *   settings.enc            encrypted msgpack: storage settings
 *   <identityAddress>/chunk-NNNN.enc   encrypted msgpack SyncChunk
 */
import type { ChromeStorageService } from './ChromeStorage.service';
import type { Account, UsbBackupAccountStatus, UsbSecurity } from './types/chromeStorage.types';
import { listPresentSticks, getHandle, readStickFile } from './UsbKey.service';
import { initialOffsets, type SyncOffsets, type UsbBackupChunkResponse } from './usbBackupBackground';
import { sendMessageAsync } from '../utils/chromeHelpers';
import {
  base64ToBytes,
  bytesToBase64,
  combinePassKey,
  decryptBytes,
  deriveBackupKey,
  encryptBytes,
  unwrapMaster,
  USB_FILE_DIR,
} from '../utils/usbCrypto';
import { derivePasswordKey } from './passKey';

export const USB_BACKUP_DIR = 'backup';
const RESTORE_FILE = 'restore.json';
const MANIFEST_FILE = 'manifest.enc';
const KEYS_FILE = 'keys.enc';
const SETTINGS_FILE = 'settings.enc';
/** After this many increments an account's chunks are rebuilt from scratch. */
const COMPACT_AFTER_CHUNKS = 40;
/** A key not refreshed for this long shows as stale. */
export const USB_BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();
const dec = new TextDecoder();

// --- On-drive formats ---

interface RestoreJson {
  format: 'yours-usb-backup';
  version: 1;
  chain: 'main';
  salt: string;
  /** Wrappers and verifier only; no secrets. Restore unwraps with the drive's own file. */
  usbSecurity: UsbSecurity;
}

interface ManifestAccount {
  identityKey: string;
  identityAddress: string;
  name: string;
  chunkCount: number;
  /** Cursor for the next pass. `since` absent means a full pass is needed. */
  since?: string;
  offsets: SyncOffsets;
  /** True once at least one full pass completed. */
  complete: boolean;
  lastBackupAt?: string;
}

interface Manifest {
  version: 1;
  createdAt: string;
  updatedAt: string;
  accounts: Record<string, ManifestAccount>;
}

export interface KeysFile {
  accounts: Record<string, Account>;
  selectedAccount: string;
  accountNumber: number;
  salt: string;
  colorTheme?: unknown;
  showWelcome?: boolean;
  deviceId?: string;
  version?: number;
}

// --- Progress ---

export type UsbBackupEvent =
  | { phase: 'start'; stickId: string; totalAccounts: number }
  | { phase: 'account'; stickId: string; accountName: string; accountIndex: number; totalAccounts: number }
  | { phase: 'chunk'; stickId: string; accountName: string; chunkIndex: number }
  | { phase: 'done'; stickId: string; changed: boolean }
  | { phase: 'error'; stickId?: string; message: string }
  | { phase: 'idle' };

type Listener = (e: UsbBackupEvent) => void;
const listeners = new Set<Listener>();
export const onUsbBackup = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = (e: UsbBackupEvent) => listeners.forEach((l) => l(e));

// --- Drive helpers ---

const backupDir = async (drive: FileSystemDirectoryHandle, create: boolean) => {
  const yours = await drive.getDirectoryHandle(USB_FILE_DIR, { create });
  return yours.getDirectoryHandle(USB_BACKUP_DIR, { create });
};

const writeFile = async (dir: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> => {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } finally {
    await w.close();
  }
};

const readFileBytes = async (dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | null> => {
  try {
    const fh = await dir.getFileHandle(name);
    return new Uint8Array(await (await fh.getFile()).arrayBuffer());
  } catch {
    return null;
  }
};

const writeEncryptedJson = (key: CryptoKey, dir: FileSystemDirectoryHandle, name: string, value: unknown) =>
  encryptBytes(key, enc.encode(JSON.stringify(value))).then((b) => writeFile(dir, name, b));

const readEncryptedJson = async <T>(
  key: CryptoKey,
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<T | null> => {
  const bytes = await readFileBytes(dir, name);
  if (!bytes) return null;
  try {
    return JSON.parse(dec.decode(await decryptBytes(key, bytes))) as T;
  } catch {
    return null;
  }
};

const chunkName = (i: number) => `chunk-${String(i).padStart(4, '0')}.enc`;

// --- The sync ---

let inFlight: Promise<void> | null = null;
let pendingRun = false;
let debounceTimer: number | undefined;

/** True when USB backup should run at all for this wallet. */
export const usbBackupEnabled = (usb: UsbSecurity | undefined): usb is UsbSecurity =>
  !!usb?.enabled && usb.backup?.enabled !== false;

/**
 * Ask for a run soon. Coalesces bursts (several sync events in a row) and
 * queues one follow-up run if a run is already in progress.
 */
export const requestUsbBackup = (chromeStorageService: ChromeStorageService, delayMs = 3000): void => {
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = undefined;
    void runUsbBackup(chromeStorageService);
  }, delayMs);
};

/** Run now (serialised). Resolves when this run, and any queued follow-up, finish. */
export const runUsbBackup = async (chromeStorageService: ChromeStorageService): Promise<void> => {
  if (inFlight) {
    pendingRun = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      await syncAllSticks(chromeStorageService);
    } catch (err) {
      emit({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      inFlight = null;
      emit({ phase: 'idle' });
    }
    if (pendingRun) {
      pendingRun = false;
      await runUsbBackup(chromeStorageService);
    }
  })();
  return inFlight;
};

const syncAllSticks = async (chromeStorageService: ChromeStorageService): Promise<void> => {
  await chromeStorageService.getAndSetStorage();
  const usb = chromeStorageService.getUsbSecurity();
  if (!usbBackupEnabled(usb)) return;
  const passKey = await chromeStorageService.getPassKey();
  if (!passKey) return;
  const { present } = await listPresentSticks(usb);
  if (present.length === 0) return;
  const key = await deriveBackupKey(passKey);
  for (const stickId of present) {
    const handle = await getHandle(stickId);
    if (!handle) continue;
    try {
      await syncStick(chromeStorageService, usb, key, stickId, handle);
    } catch (err) {
      emit({ phase: 'error', stickId, message: err instanceof Error ? err.message : String(err) });
    }
  }
};

const syncStick = async (
  chromeStorageService: ChromeStorageService,
  usb: UsbSecurity,
  key: CryptoKey,
  stickId: string,
  drive: FileSystemDirectoryHandle,
): Promise<void> => {
  const storage = chromeStorageService.storage;
  if (!storage?.accounts || !storage.salt || !storage.storageIdentityKey) return;
  const dir = await backupDir(drive, true);
  const accounts = Object.entries(storage.accounts).filter(([, a]) => a?.pubKeys?.identityPubKey);
  emit({ phase: 'start', stickId, totalAccounts: accounts.length });

  // Restore needs these before it can decrypt anything else.
  const restore: RestoreJson = {
    format: 'yours-usb-backup',
    version: 1,
    chain: 'main',
    salt: storage.salt,
    usbSecurity: usb,
  };
  await writeFile(dir, RESTORE_FILE, enc.encode(JSON.stringify(restore, null, 2)));

  // Keys and settings are small; rewrite them every pass so labels, icons, and
  // settings on the drive never lag.
  const keys: KeysFile = {
    accounts: storage.accounts,
    selectedAccount: storage.selectedAccount ?? '',
    accountNumber: storage.accountNumber ?? 1,
    salt: storage.salt,
    colorTheme: storage.colorTheme,
    showWelcome: storage.showWelcome,
    deviceId: storage.deviceId,
    version: storage.version,
  };
  await writeEncryptedJson(key, dir, KEYS_FILE, keys);
  if (!(await readFileBytes(dir, SETTINGS_FILE))) {
    const res = await sendMessageAsync<{ success: boolean; settingsData?: string; error?: string }>({
      action: 'USB_BACKUP_SETTINGS',
    });
    if (!res?.success || !res.settingsData) throw new Error(res?.error ?? 'Could not read storage settings');
    await writeFile(dir, SETTINGS_FILE, await encryptBytes(key, base64ToBytes(res.settingsData)));
  }

  const now = new Date().toISOString();
  const manifest: Manifest = (await readEncryptedJson<Manifest>(key, dir, MANIFEST_FILE)) ?? {
    version: 1,
    createdAt: now,
    updatedAt: now,
    accounts: {},
  };
  const saveManifest = async () => {
    manifest.updatedAt = new Date().toISOString();
    await writeEncryptedJson(key, dir, MANIFEST_FILE, manifest);
  };

  let changed = false;
  for (let i = 0; i < accounts.length; i++) {
    const [identityAddress, account] = accounts[i];
    const identityKey = account.pubKeys.identityPubKey;
    emit({ phase: 'account', stickId, accountName: account.name, accountIndex: i, totalAccounts: accounts.length });

    let entry = manifest.accounts[identityAddress];
    if (!entry || entry.identityKey !== identityKey) {
      entry = {
        identityKey,
        identityAddress,
        name: account.name,
        chunkCount: 0,
        offsets: initialOffsets(),
        complete: false,
      };
      manifest.accounts[identityAddress] = entry;
    }
    entry.name = account.name;

    // Compaction: too many increments, or a previous full pass never finished.
    if (entry.complete && entry.chunkCount >= COMPACT_AFTER_CHUNKS) {
      await removeAccountDir(dir, identityAddress);
      entry.chunkCount = 0;
      entry.since = undefined;
      entry.offsets = initialOffsets();
      entry.complete = false;
      await saveManifest();
    }

    const accountDir = await dir.getDirectoryHandle(identityAddress, { create: true });
    const passStart = new Date().toISOString();
    const since = entry.since;
    let wroteAny = false;

    for (;;) {
      const res = await sendMessageAsync<UsbBackupChunkResponse>({
        action: 'USB_BACKUP_CHUNK',
        identityKey,
        since,
        offsets: entry.offsets,
        toStorageIdentityKey: `usb-${stickId}`,
      });
      if (!res?.success || !res.chunkData || !res.counts) throw new Error(res?.error ?? 'Could not read wallet data');
      // The toolbox returns rows updated at or after `since`, so an increment
      // always includes at least one row already seen. Only newer rows count.
      const isNew = !since || (res.newestUpdatedAt !== undefined && res.newestUpdatedAt > since);
      if (!res.hasData || !isNew) break;

      const bytes = await encryptBytes(key, base64ToBytes(res.chunkData));
      await writeFile(accountDir, chunkName(entry.chunkCount), bytes);
      entry.chunkCount++;
      entry.offsets = entry.offsets.map((o) => ({ name: o.name, offset: o.offset + (res.counts?.[o.name] ?? 0) }));
      wroteAny = true;
      changed = true;
      emit({ phase: 'chunk', stickId, accountName: account.name, chunkIndex: entry.chunkCount });
      await saveManifest();
    }

    // Pass complete: next time, only rows updated since this pass started.
    entry.since = passStart;
    entry.offsets = initialOffsets();
    entry.complete = true;
    if (wroteAny || !entry.lastBackupAt) entry.lastBackupAt = new Date().toISOString();
    await saveManifest();
    await recordStatus(chromeStorageService, identityAddress, stickId, entry.lastBackupAt);
  }

  emit({ phase: 'done', stickId, changed });
};

const removeAccountDir = async (dir: FileSystemDirectoryHandle, name: string) => {
  try {
    await dir.removeEntry(name, { recursive: true });
  } catch {
    // Already gone.
  }
};

const recordStatus = async (
  chromeStorageService: ChromeStorageService,
  identityAddress: string,
  stickId: string,
  lastBackupAt: string,
) => {
  const current = chromeStorageService.storage?.usbBackupStatus ?? {};
  const prev = current[identityAddress];
  const stickIds = Array.from(new Set([...(prev?.stickIds ?? []), stickId]));
  const next: Record<string, UsbBackupAccountStatus> = { ...current, [identityAddress]: { lastBackupAt, stickIds } };
  await chromeStorageService.replaceTopLevel({ usbBackupStatus: next });
};

// --- Status helpers for the UI ---

export interface StickBackupSummary {
  stickId: string;
  /** Newest completed backup across accounts on this key, or undefined if never. */
  lastBackupAt?: string;
  stale: boolean;
}

/** Summarise per-key freshness from the local status record (no drive access). */
export const summariseUsbBackup = (
  usb: UsbSecurity | undefined,
  status: Record<string, UsbBackupAccountStatus> | undefined,
  now = Date.now(),
): StickBackupSummary[] =>
  (usb?.sticks ?? []).map((s) => {
    let newest: string | undefined;
    for (const st of Object.values(status ?? {})) {
      if (st.stickIds.includes(s.id) && (!newest || st.lastBackupAt > newest)) newest = st.lastBackupAt;
    }
    const stale = !newest || now - new Date(newest).getTime() > USB_BACKUP_STALE_MS;
    return { stickId: s.id, lastBackupAt: newest, stale };
  });

// --- Restore from a drive (fresh install) ---

export interface UsbRestorePayload {
  manifestData: string;
  chromeStorageData: string;
  settingsData: string;
  chunksData: Record<string, string>;
}

/**
 * Read a backup off a drive and turn it into exactly what the existing
 * MASTER_RESTORE handler expects. The drive's own key file plus the password
 * rebuild the backup key; account blobs are re-encrypted under the
 * password-only key so restore (and later unlock, with USB off) work as for a
 * file backup.
 */
export const readUsbBackup = async (drive: FileSystemDirectoryHandle, password: string): Promise<UsbRestorePayload> => {
  const stick = await readStickFile(drive);
  if (!stick) throw new Error("This drive doesn't hold a Yours USB key");
  const dir = await backupDir(drive, false).catch(() => null);
  if (!dir) throw new Error('No backup found on this drive');
  const restoreRaw = await readFileBytes(dir, RESTORE_FILE);
  if (!restoreRaw) throw new Error('No backup found on this drive');
  const restore = JSON.parse(dec.decode(restoreRaw)) as RestoreJson;
  if (restore.format !== 'yours-usb-backup') throw new Error('Unrecognised backup format');

  const entry = restore.usbSecurity.sticks.find((s) => s.id === stick.id);
  if (!entry) throw new Error('This backup was not written by this USB key');
  let master: string;
  try {
    master = await unwrapMaster(entry.wrappedMaster, stick.secret, entry.id);
  } catch {
    throw new Error('This USB key does not match the backup');
  }
  const pbkdf = derivePasswordKey(password, restore.salt);
  const combined = await combinePassKey(pbkdf, master);
  const key = await deriveBackupKey(combined);

  const manifest = await readEncryptedJson<Manifest>(key, dir, MANIFEST_FILE);
  const keys = await readEncryptedJson<KeysFile>(key, dir, KEYS_FILE);
  const settingsEnc = await readFileBytes(dir, SETTINGS_FILE);
  if (!manifest || !keys || !settingsEnc) throw new Error('Incorrect password, or the backup is incomplete');
  const settings = await decryptBytes(key, settingsEnc);

  // Blobs on the drive are under the combined key; restore expects password-only.
  const { decrypt, encrypt } = await import('../utils/crypto');
  const accounts: Record<string, Account> = {};
  for (const [id, account] of Object.entries(keys.accounts)) {
    if (!account?.encryptedKeys) continue;
    const plain = await decrypt(account.encryptedKeys, combined);
    const { keyEpoch: _e, ...rest } = account;
    accounts[id] = { ...rest, encryptedKeys: await encrypt(plain, pbkdf) };
  }
  const chromeStorage = { ...keys, accounts };

  const chunksData: Record<string, string> = {};
  const manifestAccounts: Array<{ identityKey: string; identityAddress: string; name: string; chunkCount: number }> =
    [];
  for (const acct of Object.values(manifest.accounts)) {
    if (!acct.complete && acct.chunkCount === 0) continue;
    const accountDir = await dir.getDirectoryHandle(acct.identityAddress).catch(() => null);
    if (!accountDir) continue;
    for (let i = 0; i < acct.chunkCount; i++) {
      const bytes = await readFileBytes(accountDir, chunkName(i));
      if (!bytes) throw new Error(`Backup is missing a chunk for ${acct.name}`);
      chunksData[`${acct.identityAddress}/chunk-${String(i).padStart(4, '0')}.bin`] = bytesToBase64(
        await decryptBytes(key, bytes),
      );
    }
    manifestAccounts.push({
      identityKey: acct.identityKey,
      identityAddress: acct.identityAddress,
      name: acct.name,
      chunkCount: acct.chunkCount,
    });
  }
  const v2Manifest = { version: 2, createdAt: manifest.updatedAt, chain: 'main', accounts: manifestAccounts };

  return {
    manifestData: bytesToBase64(enc.encode(JSON.stringify(v2Manifest))),
    chromeStorageData: bytesToBase64(enc.encode(JSON.stringify(chromeStorage))),
    settingsData: bytesToBase64(settings),
    chunksData,
  };
};

/** Cheap check used by the start screen: does this drive carry a Yours backup at all? */
export const driveHasUsbBackup = async (drive: FileSystemDirectoryHandle): Promise<boolean> => {
  const dir = await backupDir(drive, false).catch(() => null);
  if (!dir) return false;
  return (await readFileBytes(dir, RESTORE_FILE)) !== null;
};
