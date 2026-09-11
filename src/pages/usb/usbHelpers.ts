/**
 * Small helpers shared by the USB window flows. Kept out of the services
 * because those are being edited concurrently.
 */
import { makeStickFile, readStickFile, writeStickFile } from '../../services/UsbKey.service';
import type { UsbSecurity, UsbStickEntry } from '../../services/types/chromeStorage.types';
import { newStickId, newStickSecret } from '../../utils/usbCrypto';

export const INTER = "'Inter', Arial, Helvetica, sans-serif";
export const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace";
export const DANGER = '#ef4444';
export const WARN = '#f59e0b';
export const MUTED = '#98A2B3';

/** The OS picker rejects with AbortError when the user closes it without choosing. */
export const isAbort = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';

export const errorText = (e: unknown, fallback = 'Something went wrong'): string => {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return fallback;
};

export interface PreparedDrive {
  handle: FileSystemDirectoryHandle;
  id: string;
  secret: string;
  /** True when the drive already carried a valid Yours key file that was reused. */
  existed: boolean;
  /** Set when the existing file belongs to a stick already registered on this wallet. */
  registered?: UsbStickEntry;
}

/**
 * Read the picked drive. Reuse an existing valid key file (its id and secret)
 * so a drive enrolled on another install keeps working there; otherwise
 * write a fresh one.
 */
export const prepareDrive = async (
  handle: FileSystemDirectoryHandle,
  usbSecurity?: UsbSecurity,
): Promise<PreparedDrive> => {
  const file = await readStickFile(handle);
  if (file) {
    const registered = usbSecurity?.sticks.find((s) => s.id === file.id);
    return { handle, id: file.id, secret: file.secret, existed: true, registered };
  }
  const id = newStickId();
  const secret = newStickSecret();
  await writeStickFile(handle, makeStickFile(id, secret));
  return { handle, id, secret, existed: false };
};

export const nextKeyLabel = (usbSecurity?: UsbSecurity): string => `USB key ${(usbSecurity?.sticks.length ?? 0) + 1}`;

/** `relocked`: the wallet locked while the re-key ran; storage is re-keyed but there is no session. */
export type RekeyResponse = { success: boolean; error?: string; epoch?: number; relocked?: boolean };
