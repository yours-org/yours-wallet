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
