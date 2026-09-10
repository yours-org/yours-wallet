/**
 * USB key security — drive access. Extension pages only (popup, prompt
 * window, USB window): the File System Access API needs a document, and the
 * picker plus permission prompts need a user gesture.
 *
 * The drive holds one file, `.yours/usb-key.json`, with a stick id and a
 * random secret. Directory handles live in their own IndexedDB database so
 * they survive popup restarts; Chrome still asks the user to re-confirm
 * access after a browser restart (`queryPermission` reports 'prompt').
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { UsbSecurity, UsbStickEntry } from './types/chromeStorage.types';
import {
  parseStickFile,
  serializeStickFile,
  unwrapMaster,
  verifyMasterCheck,
  USB_FILE_DIR,
  USB_FILE_FORMAT,
  USB_FILE_MAX_BYTES,
  USB_FILE_NAME,
  USB_FILE_VERSION,
  type UsbStickFile,
} from '../utils/usbCrypto';

// --- Ambient types: the File System Access API pieces lib.dom does not declare ---

type PermissionMode = 'read' | 'readwrite';
type HandlePermissionState = 'granted' | 'denied' | 'prompt';

interface PermissionCapableHandle extends FileSystemDirectoryHandle {
  queryPermission(descriptor?: { mode?: PermissionMode }): Promise<HandlePermissionState>;
  requestPermission(descriptor?: { mode?: PermissionMode }): Promise<HandlePermissionState>;
}

type DirectoryPicker = (options?: {
  id?: string;
  mode?: PermissionMode;
  startIn?: unknown;
}) => Promise<FileSystemDirectoryHandle>;

export const USB_HANDLE_DB_NAME = 'yours-usb-handles';
const HANDLE_STORE = 'handles';
const PICKER_ID = 'yours-usb-key';

export const isUsbSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

const openHandleDb = (): Promise<IDBPDatabase> =>
  openDB(USB_HANDLE_DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
    },
  });

export const saveHandle = async (stickId: string, handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await openHandleDb();
  try {
    await db.put(HANDLE_STORE, handle, stickId);
  } finally {
    db.close();
  }
};

export const getHandle = async (stickId: string): Promise<FileSystemDirectoryHandle | undefined> => {
  const db = await openHandleDb();
  try {
    return (await db.get(HANDLE_STORE, stickId)) as FileSystemDirectoryHandle | undefined;
  } finally {
    db.close();
  }
};

export const getAllHandles = async (): Promise<Map<string, FileSystemDirectoryHandle>> => {
  const db = await openHandleDb();
  try {
    const keys = (await db.getAllKeys(HANDLE_STORE)) as string[];
    const values = (await db.getAll(HANDLE_STORE)) as FileSystemDirectoryHandle[];
    return new Map(keys.map((k, i) => [k, values[i]]));
  } finally {
    db.close();
  }
};

export const deleteHandle = async (stickId: string): Promise<void> => {
  const db = await openHandleDb();
  try {
    await db.delete(HANDLE_STORE, stickId);
  } finally {
    db.close();
  }
};

/** Drop the whole handle store. Used on disable and on restore. */
export const clearHandles = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(USB_HANDLE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
};

/** Opens the OS folder picker. Must be called from a click handler in a page that survives blur. */
export const pickDrive = async (): Promise<FileSystemDirectoryHandle> => {
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
  return picker({ id: PICKER_ID, mode: 'readwrite' });
};

export const queryHandlePermission = async (handle: FileSystemDirectoryHandle): Promise<HandlePermissionState> => {
  try {
    return await (handle as PermissionCapableHandle).queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
};

/** Needs a user gesture. Returns true when access is granted. */
export const requestHandlePermission = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
  try {
    return (await (handle as PermissionCapableHandle).requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
};

/** Read and strictly parse the stick file. Null when missing, unreadable, oversized, or malformed. */
export const readStickFile = async (drive: FileSystemDirectoryHandle): Promise<UsbStickFile | null> => {
  try {
    const dir = await drive.getDirectoryHandle(USB_FILE_DIR);
    const fileHandle = await dir.getFileHandle(USB_FILE_NAME);
    const file = await fileHandle.getFile();
    if (file.size > USB_FILE_MAX_BYTES) return null;
    return parseStickFile(await file.text());
  } catch {
    return null;
  }
};

export const writeStickFile = async (drive: FileSystemDirectoryHandle, contents: UsbStickFile): Promise<void> => {
  const dir = await drive.getDirectoryHandle(USB_FILE_DIR, { create: true });
  const fileHandle = await dir.getFileHandle(USB_FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(serializeStickFile(contents));
  } finally {
    await writable.close();
  }
};

/** Best effort. The file is harmless once its wrapper is gone, so failure here is not fatal. */
export const deleteStickFile = async (drive: FileSystemDirectoryHandle): Promise<boolean> => {
  try {
    const dir = await drive.getDirectoryHandle(USB_FILE_DIR);
    await dir.removeEntry(USB_FILE_NAME);
    try {
      await drive.removeEntry(USB_FILE_DIR);
    } catch {
      // Directory not empty or already gone; leave it.
    }
    return true;
  } catch {
    return false;
  }
};

export const makeStickFile = (id: string, secret: string): UsbStickFile => ({
  format: USB_FILE_FORMAT,
  version: USB_FILE_VERSION,
  id,
  secret,
});

// --- Probing: "is a registered stick present, and does it open the master?" ---

export type StickProbe =
  | { status: 'ok'; stickId: string; master: string; handle: FileSystemDirectoryHandle }
  /** A saved handle exists but Chrome wants the user to re-confirm access (after a browser restart). */
  | { status: 'permission'; stickIds: string[] }
  /** Handles exist but none currently reads a matching, valid file (drive unplugged, renamed, or file damaged). */
  | { status: 'absent' }
  /** No handle saved on this browser profile for any registered stick. */
  | { status: 'no-handles' };

const unwrapFromFile = async (
  file: UsbStickFile,
  usbSecurity: UsbSecurity,
): Promise<{ entry: UsbStickEntry; master: string } | null> => {
  const entry = usbSecurity.sticks.find((s) => s.id === file.id);
  if (!entry) return null;
  try {
    const master = await unwrapMaster(entry.wrappedMaster, file.secret, entry.id);
    if (!(await verifyMasterCheck(master, usbSecurity.masterCheck))) return null;
    return { entry, master };
  } catch {
    return null;
  }
};

/**
 * Try every saved handle for the registered sticks. A file with the right id
 * but a wrong secret does not count as present: the master must unwrap and
 * pass the verifier.
 */
export const probeSticks = async (usbSecurity: UsbSecurity): Promise<StickProbe> => {
  const handles = await getAllHandles();
  const registered = new Set(usbSecurity.sticks.map((s) => s.id));
  const candidates = [...handles.entries()].filter(([id]) => registered.has(id));
  if (candidates.length === 0) return { status: 'no-handles' };

  const needPermission: string[] = [];
  for (const [stickId, handle] of candidates) {
    const perm = await queryHandlePermission(handle);
    if (perm === 'prompt') {
      needPermission.push(stickId);
      continue;
    }
    if (perm !== 'granted') continue;
    const file = await readStickFile(handle);
    if (!file) continue;
    const opened = await unwrapFromFile(file, usbSecurity);
    if (opened) return { status: 'ok', stickId: opened.entry.id, master: opened.master, handle };
  }
  if (needPermission.length > 0) return { status: 'permission', stickIds: needPermission };
  return { status: 'absent' };
};

/**
 * Open a freshly picked drive and, if it carries a file for a registered
 * stick, save the handle under that id and unwrap. Used by "Find my USB key".
 */
export const adoptPickedDrive = async (
  drive: FileSystemDirectoryHandle,
  usbSecurity: UsbSecurity,
): Promise<StickProbe> => {
  const file = await readStickFile(drive);
  if (!file) return { status: 'absent' };
  const opened = await unwrapFromFile(file, usbSecurity);
  if (!opened) return { status: 'absent' };
  await saveHandle(opened.entry.id, drive);
  return { status: 'ok', stickId: opened.entry.id, master: opened.master, handle: drive };
};

// --- The dedicated USB window ---

export type UsbWindowMode = 'enroll' | 'add' | 'repick' | 'rotate' | 'disable' | 'unlock';

/**
 * Picker and permission prompts must run in a page that survives focus loss.
 * The browser-action popup closes on blur, so every such flow opens usb.html
 * as its own window. Pages call this directly; it needs no background help.
 */
export const openUsbWindow = async (mode: UsbWindowMode): Promise<void> => {
  const url = chrome.runtime.getURL('usb.html') + `?mode=${mode}`;
  const existing = (await chrome.windows.getAll({ populate: true })).find((w) =>
    w.tabs?.some((t) => t.url?.startsWith(chrome.runtime.getURL('usb.html'))),
  );
  if (existing?.id) {
    const tab = existing.tabs?.find((t) => t.url?.startsWith(chrome.runtime.getURL('usb.html')));
    if (tab?.id) await chrome.tabs.update(tab.id, { url });
    await chrome.windows.update(existing.id, { focused: true });
    return;
  }
  await chrome.windows.create({ url, type: 'popup', width: 460, height: 640 });
};
