import { ECIES, PrivateKey, PublicKey, Utils } from '@bsv/sdk';
import CryptoJS from 'crypto-js';

const V2_PREFIX = 'v2:';

// --- Key derivation (unchanged — changing this would break existing passwords) ---

export const deriveKey = (password: string, salt: string) => {
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 100000,
  });

  return key.toString(CryptoJS.enc.Hex);
};

export const generateRandomSalt = (length = 16) => {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(length)));
};

// --- Hex conversion helpers ---

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// --- v2: AES-256-GCM via Web Crypto API (passKey used directly as key) ---

const importKey = async (passKeyHex: string): Promise<CryptoKey> => {
  return crypto.subtle.importKey('raw', hexToBytes(passKeyHex).buffer as ArrayBuffer, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
};

export const encrypt = async (textToEncrypt: string, passKeyHex: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV per NIST recommendation for GCM
  const key = await importKey(passKeyHex);
  const encoded = new TextEncoder().encode(textToEncrypt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // GCM auth tag is appended to ciphertext automatically
  return V2_PREFIX + bytesToHex(iv) + bytesToHex(new Uint8Array(ciphertext));
};

// --- Decrypt: v2 (AES-GCM) or legacy (CryptoJS AES-CBC with 1k-iteration PBKDF2) ---

export const decrypt = async (data: string, passKeyHex: string): Promise<string> => {
  if (data.startsWith(V2_PREFIX)) {
    const payload = data.slice(V2_PREFIX.length);
    const iv = hexToBytes(payload.slice(0, 24)); // 12 bytes = 24 hex chars
    const ciphertext = hexToBytes(payload.slice(24));
    const key = await importKey(passKeyHex);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(decrypted);
  }

  // Legacy: salt(32 hex) + iv(32 hex) + base64 ciphertext, PBKDF2 1k iterations AES-CBC
  return decryptLegacy(data, passKeyHex);
};

const decryptLegacy = (saltedCiphertext: string, password: string): string => {
  const salt = CryptoJS.enc.Hex.parse(saltedCiphertext.slice(0, 32));
  const iv = CryptoJS.enc.Hex.parse(saltedCiphertext.slice(32, 64));
  const ciphertext = saltedCiphertext.slice(64);

  const key256Bits = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 1000,
  });

  const bytes = CryptoJS.AES.decrypt(ciphertext, key256Bits, { iv });
  return bytes.toString(CryptoJS.enc.Utf8);
};

// --- ECIES (unchanged) ---

export const encryptUsingPrivKey = (
  message: string,
  encoding: 'utf8' | 'hex' | 'base64' = 'utf8',
  pubKeys: PublicKey[],
  privateKey: PrivateKey,
) => {
  const msgBuf = Utils.toArray(message, encoding);
  return pubKeys.map((pubKey) => Utils.toBase64(ECIES.electrumEncrypt(msgBuf, pubKey, privateKey)));
};

export const decryptUsingPrivKey = (messages: string[], privateKey: PrivateKey) => {
  return messages.map((m) => Utils.toBase64(ECIES.electrumDecrypt(Utils.toArray(m, 'base64'), privateKey)));
};
