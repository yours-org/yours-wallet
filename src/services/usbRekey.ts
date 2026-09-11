/**
 * Re-key every account's `encryptedKeys` from one passKey to another.
 * Pure: no storage access, so it is unit-testable and the background can wrap
 * it in the coordination the design requires (marker, mutex, atomic write,
 * read-back). See docs/usb-key-security.md "Re-key routine".
 */
import { decrypt, encrypt } from '../utils/crypto';
import type { Account } from './types/chromeStorage.types';

export interface RekeyResult {
  accounts: Record<string, Account>;
  count: number;
}

const parseKeys = (json: string): void => {
  const parsed = JSON.parse(json) as { identityWif?: unknown; walletWif?: unknown };
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Decrypted keys are not an object');
  if (typeof parsed.walletWif !== 'string' && typeof parsed.identityWif !== 'string') {
    throw new Error('Decrypted keys are missing wif fields');
  }
};

/**
 * Decrypt each account under `oldPassKey`, re-encrypt under `newPassKey`
 * (always v2 AES-GCM), tag with `toEpoch`, and verify the new blob decrypts.
 * Throws before returning anything if any account fails, so a caller never
 * writes a partial set.
 */
export const rekeyAccounts = async (
  accounts: Record<string, Account>,
  oldPassKey: string,
  newPassKey: string,
  toEpoch: number,
): Promise<RekeyResult> => {
  const out: Record<string, Account> = {};
  let count = 0;
  for (const [id, account] of Object.entries(accounts)) {
    if (!account?.encryptedKeys) {
      out[id] = account;
      continue;
    }
    const plain = await decrypt(account.encryptedKeys, oldPassKey);
    parseKeys(plain);
    const reEncrypted = await encrypt(plain, newPassKey);
    const check = await decrypt(reEncrypted, newPassKey);
    if (check !== plain) throw new Error(`Re-key verification failed for account ${id}`);
    out[id] = { ...account, encryptedKeys: reEncrypted, keyEpoch: toEpoch };
    count++;
  }
  return { accounts: out, count };
};

/** Accounts whose epoch tag does not match the expected one. */
export const findStaleAccounts = (accounts: Record<string, Account>, expectedEpoch: number): string[] =>
  Object.entries(accounts)
    .filter(([, a]) => a?.encryptedKeys && (a.keyEpoch ?? 0) !== expectedEpoch)
    .map(([id]) => id);

/** True when every account decrypts under `passKey`. Used for read-back verification. */
export const allAccountsDecrypt = async (accounts: Record<string, Account>, passKey: string): Promise<boolean> => {
  for (const account of Object.values(accounts)) {
    if (!account?.encryptedKeys) continue;
    try {
      parseKeys(await decrypt(account.encryptedKeys, passKey));
    } catch {
      return false;
    }
  }
  return true;
};

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_16 = /^[0-9a-f]{16}$/;

/**
 * Strict shape check for a `UsbSecurity` object that arrived from outside the
 * background's own storage (a re-key request, a backup on a drive). Returns
 * the reason it is unacceptable, or null when it is well-formed.
 */
export const validateUsbSecurity = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null) return 'USB settings are missing';
  const v = value as Record<string, unknown>;
  if (v.enabled !== true) return 'USB settings are not enabled';
  if (v.version !== 1 || v.kdfVersion !== 1) return 'Unsupported USB settings version';
  if (typeof v.masterCheck !== 'string' || !HEX_64.test(v.masterCheck)) return 'USB settings verifier is malformed';
  if (!Array.isArray(v.sticks) || v.sticks.length === 0) return 'USB settings list no keys';
  const seen = new Set<string>();
  for (const s of v.sticks as unknown[]) {
    if (typeof s !== 'object' || s === null) return 'A registered key entry is malformed';
    const e = s as Record<string, unknown>;
    if (typeof e.id !== 'string' || !HEX_16.test(e.id)) return 'A registered key id is malformed';
    if (seen.has(e.id)) return 'A registered key is listed twice';
    seen.add(e.id);
    if (typeof e.label !== 'string' || e.label.length === 0 || e.label.length > 64) return 'A key label is malformed';
    if (typeof e.wrappedMaster !== 'string' || e.wrappedMaster.length === 0 || e.wrappedMaster.length > 512) {
      return 'A key wrapper is malformed';
    }
    if (typeof e.addedAt !== 'string') return 'A key entry is missing its date';
    if (e.backupWipedAt !== undefined && typeof e.backupWipedAt !== 'string') return 'A key entry is malformed';
  }
  if (v.backup !== undefined) {
    if (typeof v.backup !== 'object' || v.backup === null) return 'USB backup settings are malformed';
    const b = v.backup as Record<string, unknown>;
    if (typeof b.enabled !== 'boolean') return 'USB backup settings are malformed';
    if (b.wipeAt !== undefined && typeof b.wipeAt !== 'string') return 'USB backup settings are malformed';
  }
  return null;
};
