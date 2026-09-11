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
 *
 * Threat model note: the drive carries the key file AND the backup. A lost
 * drive is therefore an offline password-guessing target, exactly like an
 * exported backup file. The password is the remaining factor, which is why
 * `deriveBackupKey` adds a deliberately slow step on top of the passKey.
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
import { bytesToHex } from '../utils/crypto';
import { derivePasswordKey } from './passKey';

export const USB_BACKUP_DIR = 'backup';
const RESTORE_FILE = 'restore.json';
const MANIFEST_FILE = 'manifest.enc';
const KEYS_FILE = 'keys.enc';
const SETTINGS_FILE = 'settings.enc';
/** After this many increments an account's chunks are rebuilt from scratch. */
export const COMPACT_AFTER_CHUNKS = 40;
/** A key not refreshed for this long shows as stale. */
export const USB_BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;
/** Chrome runtime messages have a hard size limit; refuse well below it with a clear message. */
const MAX_RESTORE_PAYLOAD_BYTES = 32 * 1024 * 1024;

const enc = new TextEncoder();
const dec = new TextDecoder();

// --- On-drive formats ---

/** Bump whenever `deriveBackupKey` or the file layout changes. Older backups are rebuilt, not read. */
export const USB_BACKUP_FORMAT_VERSION = 2;

interface RestoreJson {
  format: 'yours-usb-backup';
  version: number;
  chain: 'main';
  salt: string;
  /** Wrappers and verifier only; no secrets. Restore unwraps with the drive's own file. */
  usbSecurity: UsbSecurity;
}

export interface ManifestAccount {
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
  /** Content hashes so unchanged files are not rewritten every pass. */
  keysHash?: string;
  settingsHash?: string;
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

// --- Pure cursor logic (unit-tested) ---

export const newManifestEntry = (identityKey: string, identityAddress: string, name: string): ManifestAccount => ({
  identityKey,
  identityAddress,
  name,
  chunkCount: 0,
  offsets: initialOffsets(),
  complete: false,
});

/** A written chunk: one more file, offsets advanced by what it held. */
export const applyChunkToEntry = (entry: ManifestAccount, counts: Record<string, number>): ManifestAccount => ({
  ...entry,
  chunkCount: entry.chunkCount + 1,
  offsets: entry.offsets.map((o) => ({ name: o.name, offset: o.offset + (counts[o.name] ?? 0) })),
});

/**
 * A pass ended (the toolbox returned no rows). Next pass starts from this
 * pass's start time, so rows written during the pass are picked up next time.
 */
export const finishPass = (
  entry: ManifestAccount,
  passStart: string,
  wroteAny: boolean,
  now: string,
): ManifestAccount => ({
  ...entry,
  since: passStart,
  offsets: initialOffsets(),
  complete: true,
  lastBackupAt: wroteAny || !entry.lastBackupAt ? now : entry.lastBackupAt,
});

export const needsCompaction = (entry: ManifestAccount): boolean =>
  entry.complete && entry.chunkCount >= COMPACT_AFTER_CHUNKS;

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

const bytesEqual = (a: Uint8Array | null, b: Uint8Array): boolean =>
  !!a && a.length === b.length && a.every((v, i) => v === b[i]);

const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
  bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)));

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

const removeAccountDir = async (dir: FileSystemDirectoryHandle, name: string) => {
  try {
    await dir.removeEntry(name, { recursive: true });
  } catch {
    // Already gone.
  }
};

// --- The sync ---

let inFlight: Promise<UsbBackupRunResult> | null = null;
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
    return { ...again, changed: result.changed || again.changed, errors: [...result.errors, ...again.errors] };
  }
  if (result.ran && result.errors.length === 0) emit({ phase: 'done', stickId: 'all', changed: result.changed });
  emit({ phase: 'idle' });
  return result;
};

const syncAllSticks = async (chromeStorageService: ChromeStorageService): Promise<UsbBackupRunResult> => {
  const none: UsbBackupRunResult = { ran: false, sticks: 0, changed: false, errors: [] };
  await chromeStorageService.getAndSetStorage();
  const usb = chromeStorageService.getUsbSecurity();
  if (!usbBackupEnabled(usb)) return none;
  const passKey = await chromeStorageService.getPassKey();
  if (!passKey) return none;
  // Only handles Chrome has already granted are used: the loop never prompts.
  const { present } = await listPresentSticks(usb);
  if (present.length === 0) return none;
  const key = await deriveBackupKey(passKey);
  const result: UsbBackupRunResult = { ran: true, sticks: 0, changed: false, errors: [] };
  for (const stickId of present) {
    const handle = await getHandle(stickId);
    if (!handle) continue;
    result.sticks++;
    try {
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

  // Restore needs these before it can decrypt anything else. Plaintext, no
  // secrets, rewritten only when the content differs.
  const restore: RestoreJson = {
    format: 'yours-usb-backup',
    version: USB_BACKUP_FORMAT_VERSION,
    chain: 'main',
    salt: storage.salt,
    usbSecurity: usb,
  };
  const restoreBytes = enc.encode(JSON.stringify(restore, null, 2));
  const existingRestore = await readFileBytes(dir, RESTORE_FILE);
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
  const oldFormat = previousVersion !== undefined && previousVersion !== USB_BACKUP_FORMAT_VERSION;
  const manifest: Manifest = (oldFormat ? null : await readEncryptedJson<Manifest>(key, dir, MANIFEST_FILE)) ?? {
    version: 1,
    createdAt: now,
    updatedAt: now,
    accounts: {},
  };
  let manifestDirty = false;
  const saveManifest = async () => {
    if (!manifestDirty) return;
    manifest.updatedAt = new Date().toISOString();
    await writeEncryptedJson(key, dir, MANIFEST_FILE, manifest);
    manifestDirty = false;
  };

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
  if (manifest.keysHash !== keysHash || !(await readFileBytes(dir, KEYS_FILE))) {
    await writeEncryptedJson(key, dir, KEYS_FILE, keys);
    manifest.keysHash = keysHash;
    manifestDirty = true;
    changed = true;
  }
  const settingsRes = await sendMessageAsync<{ success: boolean; settingsData?: string; error?: string }>({
    action: 'USB_BACKUP_SETTINGS',
  });
  if (!settingsRes?.success || !settingsRes.settingsData) {
    throw new Error(settingsRes?.error ?? 'Could not read storage settings');
  }
  const settingsBytes = base64ToBytes(settingsRes.settingsData);
  const settingsHash = await sha256Hex(settingsBytes);
  if (manifest.settingsHash !== settingsHash || !(await readFileBytes(dir, SETTINGS_FILE))) {
    await writeFile(dir, SETTINGS_FILE, await encryptBytes(key, settingsBytes));
    manifest.settingsHash = settingsHash;
    manifestDirty = true;
    changed = true;
  }
  await saveManifest();

  for (let i = 0; i < accounts.length; i++) {
    const [identityAddress, account] = accounts[i];
    const identityKey = account.pubKeys.identityPubKey;
    emit({ phase: 'account', stickId, accountName: account.name, accountIndex: i, totalAccounts: accounts.length });
    try {
      let entry = manifest.accounts[identityAddress];
      if (!entry || entry.identityKey !== identityKey) {
        // New account, or the address now maps to different keys: start over.
        entry = newManifestEntry(identityKey, identityAddress, account.name);
        manifest.accounts[identityAddress] = entry;
        manifestDirty = true;
        await saveManifest();
        await removeAccountDir(dir, identityAddress);
      }
      if (entry.name !== account.name) {
        entry.name = account.name;
        manifestDirty = true;
      }

      // Compaction. The manifest is reset and committed BEFORE the directory
      // goes, so a crash in between can never leave a manifest that claims
      // chunks that no longer exist.
      if (needsCompaction(entry)) {
        entry = newManifestEntry(identityKey, identityAddress, account.name);
        manifest.accounts[identityAddress] = entry;
        manifestDirty = true;
        await saveManifest();
        await removeAccountDir(dir, identityAddress);
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
        // Every entity query honours `since` (inclusive), so a pass with no
        // changes returns no rows. Rows updated during a pass are picked up
        // next time because the cursor moves to this pass's start, not its end.
        if (!res.hasData) break;

        const bytes = await encryptBytes(key, base64ToBytes(res.chunkData));
        await writeFile(accountDir, chunkName(entry.chunkCount), bytes);
        entry = applyChunkToEntry(entry, res.counts);
        manifest.accounts[identityAddress] = entry;
        manifestDirty = true;
        wroteAny = true;
        changed = true;
        emit({ phase: 'chunk', stickId, accountName: account.name, chunkIndex: entry.chunkCount });
        await saveManifest();
      }

      const wasIncomplete = !entry.complete;
      entry = finishPass(entry, passStart, wroteAny, new Date().toISOString());
      manifest.accounts[identityAddress] = entry;
      manifestDirty = true;
      await saveManifest();
      if (wroteAny || wasIncomplete) {
        await recordStatus(chromeStorageService, usb, identityAddress, stickId, entry.lastBackupAt ?? passStart);
      }
    } catch (err) {
      // One account must not stop the rest: report and move on.
      const message = `${account.name}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(message);
      emit({ phase: 'error', stickId, message });
    }
  }

  await saveManifest();
  return { changed, errors };
};

const recordStatus = async (
  chromeStorageService: ChromeStorageService,
  usb: UsbSecurity,
  identityAddress: string,
  stickId: string,
  lastBackupAt: string,
) => {
  await chromeStorageService.getAndSetStorage();
  const prev = chromeStorageService.storage?.usbBackupStatus?.[identityAddress];
  const registered = new Set(usb.sticks.map((s) => s.id));
  const stickIds = Array.from(new Set([...(prev?.stickIds ?? []), stickId])).filter((id) => registered.has(id));
  const entry: UsbBackupAccountStatus = { lastBackupAt, stickIds };
  // Per-key merge: concurrent writers of other accounts are not clobbered.
  await chromeStorageService.update({ usbBackupStatus: { [identityAddress]: entry } });
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
  /** Accounts whose backup on this drive never completed a full pass. */
  partialAccounts: string[];
  /** For turning USB unlock back on right after restore, with the same key and recovery code. */
  usb: { stickId: string; usbSecurity: UsbSecurity; combinedPassKey: string };
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
  if (restore.version !== USB_BACKUP_FORMAT_VERSION) {
    throw new Error(
      'This backup was written by an older version of Yours. Open the wallet with this key inserted to refresh it, then try again.',
    );
  }

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
  const partialAccounts: string[] = [];
  const manifestAccounts: Array<{ identityKey: string; identityAddress: string; name: string; chunkCount: number }> =
    [];
  let totalBytes = 0;
  for (const acct of Object.values(manifest.accounts)) {
    if (!acct.complete) partialAccounts.push(acct.name);
    if (acct.chunkCount === 0) continue;
    const accountDir = await dir.getDirectoryHandle(acct.identityAddress).catch(() => null);
    if (!accountDir) throw new Error(`Backup is missing the data folder for ${acct.name}`);
    for (let i = 0; i < acct.chunkCount; i++) {
      const bytes = await readFileBytes(accountDir, chunkName(i));
      if (!bytes) throw new Error(`Backup is missing a chunk for ${acct.name}`);
      const plain = await decryptBytes(key, bytes);
      totalBytes += plain.length;
      if (totalBytes > MAX_RESTORE_PAYLOAD_BYTES) {
        throw new Error('This backup is too large to restore in one step. Restore from a master backup file instead.');
      }
      chunksData[`${acct.identityAddress}/chunk-${String(i).padStart(4, '0')}.bin`] = bytesToBase64(plain);
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
    partialAccounts,
    usb: { stickId: stick.id, usbSecurity: restore.usbSecurity, combinedPassKey: combined },
  };
};

/** Cheap check used by the restore options: does this drive carry a Yours backup at all? */
export const driveHasUsbBackup = async (drive: FileSystemDirectoryHandle): Promise<boolean> => {
  const dir = await backupDir(drive, false).catch(() => null);
  if (!dir) return false;
  return (await readFileBytes(dir, RESTORE_FILE)) !== null;
};
