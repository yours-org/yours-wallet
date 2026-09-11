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
  /**
   * `fresh` mode only: the new file is NOT written yet. Call `commitFreshFile`
   * once the change it belongs to has succeeded, and `restorePreviousFile`
   * if it fails after the write, so a cancelled or failed rotation never
   * leaves the drive with a secret nothing is wrapped under.
   */
  previous?: { id: string; secret: string };
  pendingWrite?: boolean;
}

export const commitFreshFile = (drive: PreparedDrive): Promise<void> =>
  writeStickFile(drive.handle, makeStickFile(drive.id, drive.secret));

export const restorePreviousFile = async (drive: PreparedDrive): Promise<void> => {
  if (drive.previous) await writeStickFile(drive.handle, makeStickFile(drive.previous.id, drive.previous.secret));
};

/**
 * Read the picked drive. Reuse an existing valid key file (its id and secret)
 * so a drive enrolled on another install keeps working there; otherwise
 * write a fresh one.
 */
export const prepareDrive = async (
  handle: FileSystemDirectoryHandle,
  usbSecurity?: UsbSecurity,
  options?: {
    /**
     * Always write a new secret, even if the drive already carries one.
     * Rotation uses this: a rotation that kept the drive's secret would still
     * match any copy of the old key file, which is what rotation is for.
     */
    fresh?: boolean;
  },
): Promise<PreparedDrive> => {
  const file = await readStickFile(handle);
  if (file && !options?.fresh) {
    const registered = usbSecurity?.sticks.find((s) => s.id === file.id);
    return { handle, id: file.id, secret: file.secret, existed: true, registered };
  }
  if (file) {
    const registered = usbSecurity?.sticks.find((s) => s.id === file.id);
    return {
      handle,
      id: newStickId(),
      secret: newStickSecret(),
      existed: true,
      registered,
      previous: { id: file.id, secret: file.secret },
      pendingWrite: true,
    };
  }
  const id = newStickId();
  const secret = newStickSecret();
  await writeStickFile(handle, makeStickFile(id, secret));
  return { handle, id, secret, existed: false };
};

export const nextKeyLabel = (usbSecurity?: UsbSecurity): string => `USB key ${(usbSecurity?.sticks.length ?? 0) + 1}`;

/** `relocked`: the wallet locked while the re-key ran; storage is re-keyed but there is no session. */
export type RekeyResponse = { success: boolean; error?: string; epoch?: number; relocked?: boolean };
