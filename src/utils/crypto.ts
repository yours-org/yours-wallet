import { ECIESCiphertext, PrivateKey, PublicKey } from 'bsv-wasm-web';
import CryptoJS from 'crypto-js';

export const deriveKey = (password: string, salt: string) => {
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 100000,
  });

  return key.toString(CryptoJS.enc.Hex);
};

export const generateRandomSalt = (length = 16) => {
  return CryptoJS.lib.WordArray.random(length).toString(CryptoJS.enc.Hex);
};

export const encrypt = (textToEncrypt: string, password: string): string => {
  const salt = CryptoJS.lib.WordArray.random(128 / 8); // 128-bit salt
  const key256Bits = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32, // 256-bit key
    iterations: 1000,
  });

  // IV (initialization vector) - we generate a random one
  const iv = CryptoJS.lib.WordArray.random(128 / 8);

  const ciphertext = CryptoJS.AES.encrypt(textToEncrypt, key256Bits, {
    iv: iv,
  });

  // We concatenate the salt and the IV before the ciphertext
  const saltedCiphertext = salt.toString() + iv.toString() + ciphertext.toString();

  return saltedCiphertext;
};

export const decrypt = (saltedCiphertext: string, password: string): string => {
  const salt = CryptoJS.enc.Hex.parse(saltedCiphertext.slice(0, 32));
  const iv = CryptoJS.enc.Hex.parse(saltedCiphertext.slice(32, 64));
  const ciphertext = saltedCiphertext.slice(64);

  const key256Bits = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 1000,
  });

  const bytes = CryptoJS.AES.decrypt(ciphertext, key256Bits, { iv: iv });
  const originalText = bytes.toString(CryptoJS.enc.Utf8);

  return originalText;
};

export const encryptUsingPrivKey = (
  message: string,
  encoding: 'utf8' | 'hex' | 'base64' = 'utf8',
  pubKeys: PublicKey[],
  privateKey: PrivateKey,
) => {
  const msgBuf = Buffer.from(message, encoding);
  const encryptedMessages = pubKeys.map((keys) => keys.encrypt_message(msgBuf, privateKey));
  return encryptedMessages.map((m) => Buffer.from(m.to_bytes()).toString('hex'));
};

export const decryptUsingPrivKey = (messages: string[], privateKey: PrivateKey) => {
  let decryptedMessages: string[] = [];
  for (const message of messages) {
    const ciphertext = ECIESCiphertext.from_bytes(Buffer.from(message, 'hex'), true);
    const pubKey = ciphertext.extract_public_key();
    const decrypted = privateKey.decrypt_message(ciphertext, pubKey);
    decryptedMessages.push(Buffer.from(decrypted).toString('utf-8'));
  }
  return decryptedMessages;
};
