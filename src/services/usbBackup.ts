/**
 * USB backup sync — the popup-side loop (OPL-4685).
 *
 * Runs only while a page is open, unlocked, and a registered drive reads.
 * For each such drive it brings every account's wallet storage up to date on
 * the drive, incrementally: the toolbox's sync chunks with a `since` cursor,
 * msgpack, encrypted under a key derived from the session passKey and the
 * drive's id. Stopping at any point is safe: drive writes swap in on close,
 * and the manifest on the drive is the cursor of record.
 *
 * Layout on the drive (all under .yours/backup/):
 *   restore.json      plaintext: salt + one wrapper per key, enough to rebuild the key
 *   manifest.enc      encrypted JSON: per-account cursors, USB settings, hashes
 *   keys.enc          encrypted JSON: the chrome-storage subset restore needs
 *   settings.enc      encrypted msgpack: storage settings
 *   <dir>/chunk-NNNN.enc   encrypted msgpack SyncChunk; <dir> is an opaque id
 *                          named only in the manifest
 *
 * Every file is AES-GCM with additional data naming the drive, the file's
 * role, and (for chunks) its folder and index, so a file moved to another
 * slot or drive fails to open rather than standing in for something else.
 * The manifest is the only authority on the USB settings: restore.json is
 * plaintext and only bootstraps the key.
 *
 * Compaction is generational: a fresh full pass is written to a new folder
 * while the previous one stays restorable, then the manifest flips and the
 * old folder goes.
 *
 * Threat model note: the drive carries the key file AND the backup. A lost
 * drive is therefore an offline password-guessing target, exactly like an
 * exported backup file. The password is the remaining factor, which is why
 * `deriveBackupKey` adds a deliberately slow step on top of the passKey.
 */
import type { sdk } from '@bsv/wallet-toolbox-client';
import { decode, encode } from '@msgpack/msgpack';
import type { ChromeStorageService } from './ChromeStorage.service';
import type { Account, UsbBackupAccountStatus, UsbSecurity } from './types/chromeStorage.types';
import { listPresentSticks, getHandle, readStickFile } from './UsbKey.service';
import { initialOffsets, type SyncOffsets, type UsbBackupChunkResponse } from './usbBackupBackground';
import { coalesceSyncChunks } from './usbBackupCoalesce';
import { validateUsbSecurity } from './usbRekey';
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
  verifyMasterCheck,
} from '../utils/usbCrypto';
import { bytesToHex } from '../utils/crypto';
import { derivePasswordKey } from './passKey';

export const USB_BACKUP_DIR = 'backup';
const RESTORE_FILE = 'restore.json';
const MANIFEST_FILE = 'manifest.enc';
const KEYS_FILE = 'keys.enc';
const SETTINGS_FILE = 'settings.enc';
/** After this many increments an account's chunks are rebuilt from scratch (see `needsCompaction`). */
export const COMPACT_AFTER_CHUNKS = 40;
/** A rebuild triggered by chunk count waits at least this long after the previous full pass. */
export const MIN_COMPACT_INTERVAL_MS = 6 * 60 * 60 * 1000;
/**
 * A full pass at least this often. Rows the toolbox merges in from another
 * store keep their original `updated_at`, which the incremental cursor never
 * sees; a periodic full pass picks them up.
 */
export const FULL_PASS_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** A key not refreshed for this long shows as stale. */
export const USB_BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;
/** Chrome runtime messages have a hard size limit; refuse well below it with a clear message. */
export const MAX_RESTORE_PAYLOAD_BYTES = 32 * 1024 * 1024;
/** Settings warns once the accounts' backups reach this: a restore may need the master backup file instead. */
export const USB_BACKUP_WARN_BYTES = 24 * 1024 * 1024;

/** Files on a user-picked drive are untrusted: never read one into memory unbounded. */
const MAX_RESTORE_JSON_BYTES = 64 * 1024;
const MAX_SMALL_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CHUNK_FILE_BYTES = 8 * 1024 * 1024;

const enc = new TextEncoder();
const dec = new TextDecoder();

// --- On-drive formats ---

/** Bump whenever `deriveBackupKey`, the AAD scheme, or the file layout changes. Older backups are rebuilt, not read. */
export const USB_BACKUP_FORMAT_VERSION = 1;
const MANIFEST_VERSION = 1;

/** Plaintext bootstrap. Carries nothing the drive's own key file does not already imply. */
interface RestoreJson {
  format: 'yours-usb-backup';
  version: number;
  chain: 'main';
  salt: string;
  sticks: Array<{ id: string; wrappedMaster: string }>;
}

export type StorageMode = 'local' | 'remote';

export interface ManifestAccount {
  identityKey: string;
  identityAddress: string;
  name: string;
  /** Folder under backup/ holding this generation's chunks. Opaque; not derived from the account. */
  dir: string;
  chunkCount: number;
  /** Cursor for the next pass. `since` absent means a full pass is needed. */
  since?: string;
  offsets: SyncOffsets;
  /** True once at least one full pass completed. */
  complete: boolean;
  lastBackupAt?: string;
  /** Start of the pass in progress. Persisted before the first chunk, so an interrupted pass resumes with the right cursor. */
  passStartedAt?: string;
  /** Chunks the last full pass wrote: the compaction threshold scales with it. */
  snapshotChunks?: number;
  lastFullPassAt?: string;
  /** Which store was active when this generation started. A change forces a full pass. */
  storageMode?: StorageMode;
  /** Plaintext bytes written in this generation. */
  bytes: number;
}

interface Manifest {
  version: number;
  createdAt: string;
  updatedAt: string;
  /** identityAddress → the restorable generation. */
  accounts: Record<string, ManifestAccount>;
  /** identityAddress → a full pass in progress that replaces `accounts[x]` once complete. */
  rebuild?: Record<string, ManifestAccount>;
  /** Content hashes so unchanged files are not rewritten every pass. */
  keysHash?: string;
  settingsHash?: string;
  /** The authoritative USB settings for restore. Authenticated, unlike restore.json. */
  usbSecurity: UsbSecurity;
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

/** Additional authenticated data for one file: drive, role, and place. */
export const backupAad = (
  stickId: string,
  role: 'manifest' | 'keys' | 'settings' | 'chunk',
  ...place: Array<string | number>
): string => ['yours-usb-backup', USB_BACKUP_FORMAT_VERSION, stickId, role, ...place].join('|');

export const storageModeOf = (account: Pick<Account, 'storageConfig'>): StorageMode =>
  account.storageConfig?.activeRemote ? 'remote' : 'local';

// --- Pure cursor logic (unit-tested) ---

export const newDirName = (): string => bytesToHex(crypto.getRandomValues(new Uint8Array(8)));

export const newManifestEntry = (
  identityKey: string,
  identityAddress: string,
  name: string,
  storageMode: StorageMode = 'local',
  dir: string = newDirName(),
): ManifestAccount => ({
  identityKey,
  identityAddress,
  name,
  dir,
  chunkCount: 0,
  offsets: initialOffsets(),
  complete: false,
  storageMode,
  bytes: 0,
});

/** A pass begins: pin its start time before anything is written, unless one is already in progress. */
export const startPass = (entry: ManifestAccount, now: string): ManifestAccount =>
  entry.passStartedAt ? entry : { ...entry, passStartedAt: now };

/** A written chunk: one more file, offsets advanced by what it held. */
export const applyChunkToEntry = (
  entry: ManifestAccount,
  counts: Record<string, number>,
  bytes = 0,
): ManifestAccount => ({
  ...entry,
  chunkCount: entry.chunkCount + 1,
  offsets: entry.offsets.map((o) => ({ name: o.name, offset: o.offset + (counts[o.name] ?? 0) })),
  bytes: entry.bytes + bytes,
});

/**
 * A pass ended (the toolbox returned no rows). The next pass starts from the
 * time this pass STARTED (the persisted `passStartedAt`, which survives an
 * interruption), so rows written during it are picked up next time.
 */
export const finishPass = (entry: ManifestAccount, wroteAny: boolean, now: string): ManifestAccount => {
  const wasFullPass = entry.since === undefined;
  const { passStartedAt, ...rest } = entry;
  return {
    ...rest,
    since: passStartedAt ?? now,
    offsets: initialOffsets(),
    complete: true,
    lastBackupAt: wroteAny || !entry.lastBackupAt ? now : entry.lastBackupAt,
    snapshotChunks: wasFullPass ? entry.chunkCount : entry.snapshotChunks,
    lastFullPassAt: wasFullPass ? now : entry.lastFullPassAt,
  };
};

/**
 * Start a fresh generation for this account? Only ever from a complete one.
 * By count: once increments have doubled the last snapshot (never below the
 * floor), and not more often than `MIN_COMPACT_INTERVAL_MS`. By time: after
 * `FULL_PASS_INTERVAL_MS`. Always: when the active store changed, since rows
 * copied in from the other store carry timestamps the cursor already passed.
 */
export const needsCompaction = (entry: ManifestAccount, storageMode: StorageMode, nowMs: number): boolean => {
  if (!entry.complete) return false;
  if (entry.storageMode !== undefined && entry.storageMode !== storageMode) return true;
  const lastFull = entry.lastFullPassAt ?? entry.lastBackupAt;
  const age = lastFull ? nowMs - new Date(lastFull).getTime() : Infinity;
  if (age >= FULL_PASS_INTERVAL_MS) return true;
  const threshold = Math.max(COMPACT_AFTER_CHUNKS, 2 * (entry.snapshotChunks ?? 0));
  return entry.chunkCount >= threshold && age >= MIN_COMPACT_INTERVAL_MS;
};

// --- Progress ---

export type UsbBackupEvent =
  | { phase: 'start'; stickId: string; totalAccounts: number }
  | { phase: 'account'; stickId: string; accountName: string; accountIndex: number; totalAccounts: number }
  | { phase: 'chunk'; stickId: string; accountName: string; chunkIndex: number }
  /** One per run, after every key and any queued follow-up run. stickId is 'all'. */
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

export interface UsbBackupRunResult {
  /** False when nothing could run: feature off, locked, or no readable key. */
  ran: boolean;
  sticks: number;
  changed: boolean;
  errors: string[];
}

// --- Drive helpers ---

const backupDir = async (drive: FileSystemDirectoryHandle, create: boolean) => {
  const yours = await drive.getDirectoryHandle(USB_FILE_DIR, { create });
  return yours.getDirectoryHandle(USB_BACKUP_DIR, { create });
};

const bytesEqual = (a: Uint8Array | null, b: Uint8Array): boolean =>
  !!a && a.length === b.length && a.every((v, i) => v === b[i]);

/** Write, then read back and compare: a backup that never checks its own output is not a backup. */
const writeFile = async (dir: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> => {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } finally {
    await w.close();
  }
  const back = new Uint8Array(await (await fh.getFile()).arrayBuffer());
  if (!bytesEqual(back, bytes)) throw new Error(`The drive did not store ${name} correctly`);
};

type FileRead = { status: 'absent' } | { status: 'too-large' } | { status: 'ok'; bytes: Uint8Array };

const readFile = async (dir: FileSystemDirectoryHandle, name: string, maxBytes: number): Promise<FileRead> => {
  let file: File;
  try {
    file = await (await dir.getFileHandle(name)).getFile();
  } catch {
    return { status: 'absent' };
  }
  if (file.size > maxBytes) return { status: 'too-large' };
  return { status: 'ok', bytes: new Uint8Array(await file.arrayBuffer()) };
};

const readFileBytes = async (
  dir: FileSystemDirectoryHandle,
  name: string,
  maxBytes: number,
): Promise<Uint8Array | null> => {
  const r = await readFile(dir, name, maxBytes);
  return r.status === 'ok' ? r.bytes : null;
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
  bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)));

const writeEncryptedJson = (
  key: CryptoKey,
  dir: FileSystemDirectoryHandle,
  name: string,
  aad: string,
  value: unknown,
) => encryptBytes(key, enc.encode(JSON.stringify(value)), aad).then((b) => writeFile(dir, name, b));

type EncryptedRead<T> = { status: 'absent' } | { status: 'unreadable' } | { status: 'ok'; value: T };

/** "Absent" and "present but will not open" are different situations; callers decide what each means. */
const readEncryptedJson = async <T>(
  key: CryptoKey,
  dir: FileSystemDirectoryHandle,
  name: string,
  aad: string,
): Promise<EncryptedRead<T>> => {
  const r = await readFile(dir, name, MAX_SMALL_FILE_BYTES);
  if (r.status === 'absent') return { status: 'absent' };
  if (r.status === 'too-large') return { status: 'unreadable' };
  try {
    return { status: 'ok', value: JSON.parse(dec.decode(await decryptBytes(key, r.bytes, aad))) as T };
  } catch {
    return { status: 'unreadable' };
  }
};

const chunkName = (i: number) => `chunk-${String(i).padStart(4, '0')}.enc`;

const removeDir = async (dir: FileSystemDirectoryHandle, name: string) => {
  try {
    await dir.removeEntry(name, { recursive: true });
  } catch {
    // Already gone.
  }
};

/** Remove every folder the manifest does not name: previous generations, deleted accounts, older layouts. */
const collectGarbage = async (dir: FileSystemDirectoryHandle, manifest: Manifest) => {
  const keep = new Set<string>();
  for (const e of Object.values(manifest.accounts)) keep.add(e.dir);
  for (const e of Object.values(manifest.rebuild ?? {})) keep.add(e.dir);
  const stray: string[] = [];
  for await (const [name, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind === 'directory' && !keep.has(name)) stray.push(name);
  }
  for (const name of stray) await removeDir(dir, name);
};

/** Erase the whole backup folder from a drive. True when it is gone (or never existed). */
export const wipeUsbBackup = async (drive: FileSystemDirectoryHandle): Promise<boolean> => {
  try {
    const yours = await drive.getDirectoryHandle(USB_FILE_DIR);
    await yours.removeEntry(USB_BACKUP_DIR, { recursive: true });
    return true;
  } catch (e) {
    return (e as { name?: string })?.name === 'NotFoundError';
  }
};

// --- The sync ---

let inFlight: Promise<UsbBackupRunResult> | null = null;
let pendingRun = false;
let debounceTimer: number | undefined;

/** True when USB backup should run at all for this wallet. */
export const usbBackupEnabled = (usb: UsbSecurity | undefined): usb is UsbSecurity =>
  !!usb?.enabled && usb.backup?.enabled !== false;

/** Backup is off and at least one registered key may still carry a copy that has not been erased. */
export const usbBackupWipePending = (usb: UsbSecurity | undefined): usb is UsbSecurity => {
  const wipeAt = usb?.backup?.wipeAt;
  if (!usb?.enabled || usb.backup?.enabled !== false || !wipeAt) return false;
  return usb.sticks.some((s) => !s.backupWipedAt || s.backupWipedAt < wipeAt);
};

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

/**
 * Run now (serialised). If a run is in progress, waits for it and then runs
 * once more, so a caller always gets a result that reflects the current state.
 */
export const runUsbBackup = async (chromeStorageService: ChromeStorageService): Promise<UsbBackupRunResult> => {
  if (inFlight) {
    pendingRun = true;
    await inFlight.catch(() => undefined);
    return runUsbBackup(chromeStorageService);
  }
  inFlight = (async () => {
    try {
      return await syncAllSticks(chromeStorageService);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ phase: 'error', message });
      return { ran: false, sticks: 0, changed: false, errors: [message] };
    } finally {
      inFlight = null;
    }
  })();
  const result = await inFlight;
  if (pendingRun) {
    // A wallet change arrived mid-run: go again before declaring anything
    // up to date, so the UI shows one continuous sync, not two.
    pendingRun = false;
    const again = await runUsbBackup(chromeStorageService);
    const merged = { ...again, changed: result.changed || again.changed, errors: [...result.errors, ...again.errors] };
    // The inner call already emitted done/idle for its own result; re-emit with the merged one.
    if (merged.ran && merged.errors.length === 0 && result.changed && !again.changed) {
      emit({ phase: 'done', stickId: 'all', changed: true });
    }
    return merged;
  }
  if (result.ran && result.errors.length === 0) emit({ phase: 'done', stickId: 'all', changed: result.changed });
  emit({ phase: 'idle' });
  return result;
};

/**
 * Backup was turned off: erase the backup folder from every registered key
 * that is readable now and has not been erased since. Keys not inserted are
 * handled when they next are. Never prompts.
 */
export const wipePendingUsbBackups = async (chromeStorageService: ChromeStorageService): Promise<void> => {
  const usb = chromeStorageService.getUsbSecurity();
  if (!usbBackupWipePending(usb)) return;
  const wipeAt = usb.backup?.wipeAt as string;
  const { present } = await listPresentSticks(usb);
  for (const stickId of present) {
    const entry = usb.sticks.find((s) => s.id === stickId);
    if (!entry || (entry.backupWipedAt && entry.backupWipedAt >= wipeAt)) continue;
    const handle = await getHandle(stickId);
    if (!handle || !(await wipeUsbBackup(handle))) continue;
    const now = new Date().toISOString();
    await chromeStorageService.updateUsbSecurity((current) => ({
      ...current,
      sticks: current.sticks.map((s) => (s.id === stickId ? { ...s, backupWipedAt: now } : s)),
    }));
  }
};

const syncAllSticks = async (chromeStorageService: ChromeStorageService): Promise<UsbBackupRunResult> => {
  const none: UsbBackupRunResult = { ran: false, sticks: 0, changed: false, errors: [] };
  await chromeStorageService.getAndSetStorage();
  const usb = chromeStorageService.getUsbSecurity();
  if (!usbBackupEnabled(usb)) {
    await wipePendingUsbBackups(chromeStorageService);
    return none;
  }
  const passKey = await chromeStorageService.getPassKey();
  if (!passKey) return none;
  // Only handles Chrome has already granted are used: the loop never prompts.
  const { present } = await listPresentSticks(usb);
  if (present.length === 0) return none;
  const result: UsbBackupRunResult = { ran: true, sticks: 0, changed: false, errors: [] };
  for (const stickId of present) {
    const handle = await getHandle(stickId);
    if (!handle) continue;
    result.sticks++;
    try {
      const key = await deriveBackupKey(passKey, stickId);
      const r = await syncStick(chromeStorageService, usb, key, stickId, handle);
      result.changed = result.changed || r.changed;
      result.errors.push(...r.errors);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(message);
      emit({ phase: 'error', stickId, message });
    }
  }
  return result;
};

const syncStick = async (
  chromeStorageService: ChromeStorageService,
  usb: UsbSecurity,
  key: CryptoKey,
  stickId: string,
  drive: FileSystemDirectoryHandle,
): Promise<{ changed: boolean; errors: string[] }> => {
  const storage = chromeStorageService.storage;
  if (!storage?.accounts || !storage.salt || !storage.storageIdentityKey) {
    throw new Error('Wallet storage is not ready');
  }
  const dir = await backupDir(drive, true);
  const accounts = Object.entries(storage.accounts).filter(([, a]) => a?.pubKeys?.identityPubKey);
  emit({ phase: 'start', stickId, totalAccounts: accounts.length });
  let changed = false;
  const errors: string[] = [];
  /** Accounts whose pass completed this run, written or not, with their generation size. */
  const verified: Array<{ identityAddress: string; bytes: number }> = [];

  // Restore needs these before it can decrypt anything else. Plaintext, no
  // secrets, rewritten only when the content differs.
  const restore: RestoreJson = {
    format: 'yours-usb-backup',
    version: USB_BACKUP_FORMAT_VERSION,
    chain: 'main',
    salt: storage.salt,
    sticks: usb.sticks.map(({ id, wrappedMaster }) => ({ id, wrappedMaster })),
  };
  const restoreBytes = enc.encode(JSON.stringify(restore, null, 2));
  const existingRestore = await readFileBytes(dir, RESTORE_FILE, MAX_RESTORE_JSON_BYTES);
  let previousVersion: number | undefined;
  if (existingRestore) {
    try {
      previousVersion = (JSON.parse(dec.decode(existingRestore)) as RestoreJson).version;
    } catch {
      previousVersion = undefined;
    }
  }
  if (!bytesEqual(existingRestore, restoreBytes)) {
    await writeFile(dir, RESTORE_FILE, restoreBytes);
    changed = true;
  }

  const now = new Date().toISOString();
  // A backup written by an older format (different key derivation or layout)
  // is unreadable here by design: start over rather than trust any of it.
  // Likewise a manifest that will not open (re-key, bit rot): start a fresh
  // manifest but delete nothing yet; old folders go once the new generation
  // is complete (see collectGarbage).
  const oldFormat = previousVersion !== undefined && previousVersion !== USB_BACKUP_FORMAT_VERSION;
  const read = oldFormat
    ? ({ status: 'absent' } as const)
    : await readEncryptedJson<Manifest>(key, dir, MANIFEST_FILE, backupAad(stickId, 'manifest'));
  if (read.status === 'unreadable') console.warn('[usbBackup] manifest on this key will not open; rebuilding');
  const manifest: Manifest =
    read.status === 'ok' && read.value.version === MANIFEST_VERSION
      ? read.value
      : { version: MANIFEST_VERSION, createdAt: now, updatedAt: now, accounts: {}, usbSecurity: usb };
  let manifestDirty = false;
  const saveManifest = async () => {
    if (!manifestDirty) return;
    manifest.updatedAt = new Date().toISOString();
    await writeEncryptedJson(key, dir, MANIFEST_FILE, backupAad(stickId, 'manifest'), manifest);
    manifestDirty = false;
  };
  // The settings a restore will trust: always the current ones.
  if (JSON.stringify(manifest.usbSecurity) !== JSON.stringify(usb)) {
    manifest.usbSecurity = usb;
    manifestDirty = true;
  }

  // Keys and settings are small. Rewrite them only when their content changed
  // (compared by hash of the plaintext, since ciphertext differs every time).
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
  const keysHash = await sha256Hex(enc.encode(JSON.stringify(keys)));
  if (manifest.keysHash !== keysHash || !(await readFileBytes(dir, KEYS_FILE, MAX_SMALL_FILE_BYTES))) {
    await writeEncryptedJson(key, dir, KEYS_FILE, backupAad(stickId, 'keys'), keys);
    manifest.keysHash = keysHash;
    manifestDirty = true;
    changed = true;
  }
  const settingsRes = await sendMessageAsync<{
    success: boolean;
    settingsData?: string;
    error?: string;
    data?: { busy?: boolean };
  }>({ action: 'USB_BACKUP_SETTINGS' });
  if (settingsRes?.data?.busy) {
    // Wallet still initialising: quietly try again on the next trigger.
    return { changed, errors: [] };
  }
  if (!settingsRes?.success || !settingsRes.settingsData) {
    throw new Error(settingsRes?.error ?? 'Could not read storage settings');
  }
  const settingsBytes = base64ToBytes(settingsRes.settingsData);
  const settingsHash = await sha256Hex(settingsBytes);
  if (manifest.settingsHash !== settingsHash || !(await readFileBytes(dir, SETTINGS_FILE, MAX_SMALL_FILE_BYTES))) {
    await writeFile(dir, SETTINGS_FILE, await encryptBytes(key, settingsBytes, backupAad(stickId, 'settings')));
    manifest.settingsHash = settingsHash;
    manifestDirty = true;
    changed = true;
  }
  await saveManifest();

  for (let i = 0; i < accounts.length; i++) {
    const [identityAddress, account] = accounts[i];
    const identityKey = account.pubKeys.identityPubKey;
    const storageMode = storageModeOf(account);
    emit({ phase: 'account', stickId, accountName: account.name, accountIndex: i, totalAccounts: accounts.length });
    try {
      let live: ManifestAccount | undefined = manifest.accounts[identityAddress];
      let building: ManifestAccount | undefined = manifest.rebuild?.[identityAddress];
      // The address now maps to different keys: neither generation is this account's.
      if (live && live.identityKey !== identityKey) {
        delete manifest.accounts[identityAddress];
        live = undefined;
        manifestDirty = true;
      }
      if (building && building.identityKey !== identityKey) {
        delete manifest.rebuild?.[identityAddress];
        building = undefined;
        manifestDirty = true;
      }
      if (!live && !building) {
        live = newManifestEntry(identityKey, identityAddress, account.name, storageMode);
        manifest.accounts[identityAddress] = live;
        manifestDirty = true;
      } else if (live && !building && needsCompaction(live, storageMode, Date.now())) {
        // Generational compaction: the new full pass goes to a fresh folder
        // while `live` stays restorable. The swap happens when it completes.
        building = newManifestEntry(identityKey, identityAddress, account.name, storageMode);
        manifest.rebuild = { ...(manifest.rebuild ?? {}), [identityAddress]: building };
        manifestDirty = true;
      }
      const slot: 'live' | 'rebuild' = building ? 'rebuild' : 'live';
      let target = (building ?? live) as ManifestAccount;
      const commit = (next: ManifestAccount) => {
        target = next;
        if (slot === 'rebuild') (manifest.rebuild as Record<string, ManifestAccount>)[identityAddress] = next;
        else manifest.accounts[identityAddress] = next;
        manifestDirty = true;
      };
      if (target.name !== account.name) commit({ ...target, name: account.name });
      // Pin the pass start on the drive before any chunk: a resumed pass must
      // move its cursor to when it began, not to when it resumed.
      commit(startPass(target, new Date().toISOString()));
      await saveManifest();

      const accountDir = await dir.getDirectoryHandle(target.dir, { create: true });
      let wroteAny = false;
      let skipped = false;

      for (;;) {
        const res = await sendMessageAsync<UsbBackupChunkResponse>({
          action: 'USB_BACKUP_CHUNK',
          identityKey,
          since: target.since,
          offsets: target.offsets,
          toStorageIdentityKey: `usb-${stickId}`,
        });
        if (!res?.success) throw new Error(res?.error ?? 'Could not read wallet data');
        if (res.noLocalData) {
          // Not on this install yet: skip without touching the cursor or status.
          skipped = true;
          break;
        }
        if (!res.chunkData || !res.counts) throw new Error('Could not read wallet data');
        // Every entity query honours `since` (inclusive), so a pass with no
        // changes returns no rows. Rows updated during a pass are picked up
        // next time because the cursor moves to this pass's start, not its end.
        if (!res.hasData) break;

        const plain = base64ToBytes(res.chunkData);
        const index = target.chunkCount;
        const bytes = await encryptBytes(key, plain, backupAad(stickId, 'chunk', target.dir, index));
        await writeFile(accountDir, chunkName(index), bytes);
        commit(applyChunkToEntry(target, res.counts, plain.length));
        wroteAny = true;
        changed = true;
        emit({ phase: 'chunk', stickId, accountName: account.name, chunkIndex: target.chunkCount });
        await saveManifest();
      }

      if (skipped) {
        // Nothing was consumed, so no pass is in progress.
        const { passStartedAt: _p, ...rest } = target;
        commit(rest);
        await saveManifest();
        continue;
      }
      commit(finishPass(target, wroteAny, new Date().toISOString()));
      if (slot === 'rebuild') {
        // Swap: the new generation is complete and restorable; retire the old one.
        const old = manifest.accounts[identityAddress];
        manifest.accounts[identityAddress] = target;
        delete (manifest.rebuild as Record<string, ManifestAccount>)[identityAddress];
        manifestDirty = true;
        await saveManifest();
        if (old) await removeDir(dir, old.dir);
        changed = true;
      } else {
        await saveManifest();
      }
      verified.push({ identityAddress, bytes: target.bytes });
    } catch (err) {
      // One account must not stop the rest: report and move on.
      const message = `${account.name}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(message);
      emit({ phase: 'error', stickId, message });
    }
  }

  await saveManifest();
  if (errors.length === 0) await collectGarbage(dir, manifest);
  // "Backed up N ago" means "last verified current on this key", so every
  // completed pass counts, written or not. One local write per run.
  if (verified.length > 0) await recordStatus(chromeStorageService, usb, verified, stickId);
  return { changed, errors };
};

const recordStatus = async (
  chromeStorageService: ChromeStorageService,
  usb: UsbSecurity,
  verified: Array<{ identityAddress: string; bytes: number }>,
  stickId: string,
) => {
  await chromeStorageService.getAndSetStorage();
  const current = chromeStorageService.storage?.usbBackupStatus ?? {};
  const registered = new Set(usb.sticks.map((s) => s.id));
  const now = new Date().toISOString();
  const patch: Record<string, UsbBackupAccountStatus> = {};
  for (const { identityAddress, bytes } of verified) {
    const prev = current[identityAddress];
    const stickIds = Array.from(new Set([...(prev?.stickIds ?? []), stickId])).filter((id) => registered.has(id));
    patch[identityAddress] = { lastBackupAt: now, stickIds, bytes };
  }
  // Per-key merge: concurrent writers of other accounts are not clobbered.
  await chromeStorageService.update({ usbBackupStatus: patch });
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
    // Never backed up counts as stale only once the key has been registered
    // long enough that a pass should have happened (fresh installs whose
    // accounts have no local data yet are not "overdue").
    const reference = newest ?? s.addedAt;
    const stale = !reference || now - new Date(reference).getTime() > USB_BACKUP_STALE_MS;
    return { stickId: s.id, lastBackupAt: newest, stale };
  });

/** Plaintext bytes across all accounts' current generations, from the local status record. */
export const usbBackupTotalBytes = (status: Record<string, UsbBackupAccountStatus> | undefined): number =>
  Object.values(status ?? {}).reduce((n, s) => n + (s.bytes ?? 0), 0);

// --- Restore from a drive (fresh install) ---

export interface UsbRestorePayload {
  manifestData: string;
  chromeStorageData: string;
  settingsData: string;
  chunksData: Record<string, string>;
  /** Accounts whose backup on this drive never completed a full pass. */
  partialAccounts: string[];
  /** For turning USB unlock back on right after restore, with the same key and recovery code. */
  usb: { stickId: string; usbSecurity: UsbSecurity; master: string; passwordKey: string };
}

const isHex = (v: unknown, len?: number): v is string =>
  typeof v === 'string' && /^[0-9a-f]*$/.test(v) && (len === undefined ? v.length > 0 : v.length === len);

const UNREADABLE = 'The backup on this drive is unreadable';

/** restore.json is plaintext on removable media: check every field before using any. */
const parseRestoreJson = (raw: Uint8Array): RestoreJson => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(dec.decode(raw));
  } catch {
    throw new Error(UNREADABLE);
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error(UNREADABLE);
  const r = parsed as Record<string, unknown>;
  if (r.format !== 'yours-usb-backup') throw new Error('Unrecognised backup format');
  if (r.version !== USB_BACKUP_FORMAT_VERSION) {
    throw new Error(
      'This backup was written by a different version of Yours. Open the wallet with this key inserted to refresh it, then try again.',
    );
  }
  if (r.chain !== 'main') throw new Error('Unrecognised backup format');
  if (!isHex(r.salt)) throw new Error(UNREADABLE);
  if (!Array.isArray(r.sticks) || r.sticks.length === 0 || r.sticks.length > 64) throw new Error(UNREADABLE);
  const sticks = (r.sticks as unknown[]).map((s) => {
    const e = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>;
    if (!isHex(e.id, 16) || typeof e.wrappedMaster !== 'string' || e.wrappedMaster.length > 512) {
      throw new Error(UNREADABLE);
    }
    return { id: e.id, wrappedMaster: e.wrappedMaster };
  });
  return { format: 'yours-usb-backup', version: r.version, chain: 'main', salt: r.salt, sticks };
};

/**
 * Read a backup off a drive and turn it into exactly what the existing
 * MASTER_RESTORE handler expects. The drive's own key file plus the password
 * rebuild the backup key; account blobs are re-encrypted under the
 * password-only key so restore (and later unlock, with USB off) work as for a
 * file backup. The chunks are folded into one consistent, dependency-ordered
 * set first (see usbBackupCoalesce).
 */
export const readUsbBackup = async (drive: FileSystemDirectoryHandle, password: string): Promise<UsbRestorePayload> => {
  const stick = await readStickFile(drive);
  if (!stick) throw new Error("This drive doesn't hold a Yours USB key");
  const dir = await backupDir(drive, false).catch(() => null);
  if (!dir) throw new Error('No backup found on this drive');
  const restoreRead = await readFile(dir, RESTORE_FILE, MAX_RESTORE_JSON_BYTES);
  if (restoreRead.status === 'absent') throw new Error('No backup found on this drive');
  if (restoreRead.status === 'too-large') throw new Error(UNREADABLE);
  const restore = parseRestoreJson(restoreRead.bytes);

  const bootstrap = restore.sticks.find((s) => s.id === stick.id);
  if (!bootstrap) throw new Error('This backup was not written by this USB key');
  let master: string;
  try {
    master = await unwrapMaster(bootstrap.wrappedMaster, stick.secret, bootstrap.id);
  } catch {
    throw new Error('This USB key does not match the backup');
  }
  const pbkdf = derivePasswordKey(password, restore.salt);
  const combined = await combinePassKey(pbkdf, master);
  const key = await deriveBackupKey(combined, stick.id);

  const manifestRead = await readEncryptedJson<Manifest>(key, dir, MANIFEST_FILE, backupAad(stick.id, 'manifest'));
  if (manifestRead.status !== 'ok') throw new Error('Incorrect password, or the backup is incomplete');
  const manifest = manifestRead.value;
  if (manifest.version !== MANIFEST_VERSION) throw new Error(UNREADABLE);

  // The manifest is authenticated; restore.json is not. Only the manifest's
  // settings are trusted, and they must agree with the master this drive opened.
  const invalid = validateUsbSecurity(manifest.usbSecurity);
  if (invalid) throw new Error(`The backup's USB settings are unusable: ${invalid}`);
  const usbSecurity = manifest.usbSecurity;
  if (!(await verifyMasterCheck(master, usbSecurity.masterCheck))) {
    throw new Error("The backup's USB settings do not match this key");
  }
  const listed = usbSecurity.sticks.find((s) => s.id === stick.id);
  if (!listed) throw new Error("The backup's USB settings do not list this key");
  try {
    if ((await unwrapMaster(listed.wrappedMaster, stick.secret, listed.id)) !== master) throw new Error('mismatch');
  } catch {
    throw new Error("The backup's USB settings do not match this key");
  }

  const keysRead = await readEncryptedJson<KeysFile>(key, dir, KEYS_FILE, backupAad(stick.id, 'keys'));
  const settingsEnc = await readFileBytes(dir, SETTINGS_FILE, MAX_SMALL_FILE_BYTES);
  if (keysRead.status !== 'ok' || !settingsEnc) throw new Error('The backup is incomplete');
  const keys = keysRead.value;
  const settings = await decryptBytes(key, settingsEnc, backupAad(stick.id, 'settings'));

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
  const partialAccounts: string[] = [];
  // Accounts whose keys are on the drive but which never got a data pass
  // (never opened on the backing-up install, or failed every pass).
  for (const [id, account] of Object.entries(keys.accounts)) {
    if (!manifest.accounts[id] && account?.name) partialAccounts.push(account.name);
  }
  const manifestAccounts: Array<{ identityKey: string; identityAddress: string; name: string; chunkCount: number }> =
    [];
  let totalBytes = 0;
  for (const acct of Object.values(manifest.accounts)) {
    if (!acct.complete) partialAccounts.push(acct.name);
    if (acct.chunkCount === 0) continue;
    const accountDir = await dir.getDirectoryHandle(acct.dir).catch(() => null);
    if (!accountDir) throw new Error(`Backup is missing the data folder for ${acct.name}`);
    const raw: sdk.SyncChunk[] = [];
    for (let i = 0; i < acct.chunkCount; i++) {
      const r = await readFile(accountDir, chunkName(i), MAX_CHUNK_FILE_BYTES);
      if (r.status !== 'ok') throw new Error(`Backup is missing a chunk for ${acct.name}`);
      let plain: Uint8Array;
      try {
        plain = await decryptBytes(key, r.bytes, backupAad(stick.id, 'chunk', acct.dir, i));
      } catch {
        throw new Error(`A chunk for ${acct.name} is damaged or out of place`);
      }
      raw.push(decode(plain) as sdk.SyncChunk);
    }
    const folded = coalesceSyncChunks(raw);
    folded.forEach((chunk, i) => {
      const bytes = new Uint8Array(encode(chunk));
      totalBytes += bytes.length;
      if (totalBytes > MAX_RESTORE_PAYLOAD_BYTES) {
        throw new Error('This backup is too large to restore in one step. Restore from a master backup file instead.');
      }
      chunksData[`${acct.identityAddress}/chunk-${String(i).padStart(4, '0')}.bin`] = bytesToBase64(bytes);
    });
    manifestAccounts.push({
      identityKey: acct.identityKey,
      identityAddress: acct.identityAddress,
      name: acct.name,
      chunkCount: folded.length,
    });
  }
  const v2Manifest = { version: 2, createdAt: manifest.updatedAt, chain: 'main', accounts: manifestAccounts };

  return {
    manifestData: bytesToBase64(enc.encode(JSON.stringify(v2Manifest))),
    chromeStorageData: bytesToBase64(enc.encode(JSON.stringify(chromeStorage))),
    settingsData: bytesToBase64(settings),
    chunksData,
    partialAccounts,
    usb: { stickId: stick.id, usbSecurity, master, passwordKey: pbkdf },
  };
};

/** Cheap check used by the restore options: does this drive carry a Yours backup at all? */
export const driveHasUsbBackup = async (drive: FileSystemDirectoryHandle): Promise<boolean> => {
  const dir = await backupDir(drive, false).catch(() => null);
  if (!dir) return false;
  return (await readFile(dir, RESTORE_FILE, MAX_RESTORE_JSON_BYTES)).status !== 'absent';
};
