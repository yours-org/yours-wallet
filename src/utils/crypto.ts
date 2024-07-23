import { ECIES, PrivateKey, PublicKey, Utils } from '@bsv/sdk';
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
  const msgBuf = Utils.toArray(message, encoding);
  return pubKeys.map((pubKey) => Utils.toBase64(ECIES.electrumEncrypt(msgBuf, pubKey, privateKey)));
};

export const decryptUsingPrivKey = (messages: string[], privateKey: PrivateKey) => {
  return messages.map((m) => Utils.toBase64(ECIES.electrumDecrypt(Utils.toArray(m, 'base64'), privateKey)));
};
