/**
 * The one place a passKey is derived from a password.
 *
 * With USB key security off this is exactly the historical PBKDF2 key. With it
 * on, the master factor (unwrapped from an inserted stick, or typed as the
 * recovery code) is mixed in, so no caller can produce a usable key without it.
 * Nothing outside this module may call `deriveKey` for a wallet passKey.
 */
import { deriveKey } from '../utils/crypto';
import { combinePassKey } from '../utils/usbCrypto';
import type { UsbSecurity } from './types/chromeStorage.types';

export class UsbKeyRequiredError extends Error {
  constructor() {
    super('USB key required');
    this.name = 'UsbKeyRequiredError';
  }
}

export interface UsbUnlockMaterial {
  /** Master factor, hex. From `unwrapMaster` or `decodeRecoveryCode`. */
  master: string;
}

/** Password-only key. Used for backups (which never depend on a drive) and as the input to the combined key. */
export const derivePasswordKey = (password: string, salt: string): string => deriveKey(password, salt);

export const derivePassKey = async (
  password: string,
  salt: string,
  usbSecurity: UsbSecurity | undefined,
  material?: UsbUnlockMaterial,
): Promise<string> => {
  const pbkdf = derivePasswordKey(password, salt);
  if (!usbSecurity?.enabled) return pbkdf;
  if (!material?.master) throw new UsbKeyRequiredError();
  return combinePassKey(pbkdf, material.master);
};
