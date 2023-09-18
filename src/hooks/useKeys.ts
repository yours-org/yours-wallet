import { useState } from "react";
import {
  decrypt,
  deriveKey,
  encrypt,
  generateRandomSalt,
} from "../utils/crypto";
import { Keys, getKeys } from "../utils/keys";
import { storage } from "../utils/storage";

type KeyStorage = {
  encryptedKeys: string;
  passKey: string;
  salt: string;
};

export const useKeys = () => {
  const [bsvAddress, setBsvAddress] = useState("");
  const generateSeedAndStoreEncrypted = (
    password: string,
    existingSalt?: string,
    mnemonic?: string
  ) => {
    const salt = existingSalt ?? generateRandomSalt();
    const passKey = deriveKey(password, salt);
    const keys = getKeys(mnemonic);
    const encryptedKeys = encrypt(JSON.stringify(keys), passKey);
    storage.set({ encryptedKeys, passKey, salt });
    return keys.mnemonic;
  };

  const retrieveKeys = (): Promise<Keys> => {
    return new Promise((resolve, reject) => {
      storage.get(
        ["encryptedKeys", "passKey", "salt"],
        (result: KeyStorage) => {
          try {
            const d = decrypt(result.encryptedKeys, result.passKey);
            const keys: Keys = JSON.parse(d);
            setBsvAddress(keys.walletAddress);
            resolve(keys);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  };

  const verifyPassword = (password: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      storage.get(["salt", "passKey"], (result: KeyStorage) => {
        try {
          const derivedKey = deriveKey(password, result.salt);
          resolve(derivedKey === result.passKey);
        } catch (error) {
          reject(error);
        }
      });
    });
  };

  return {
    generateSeedAndStoreEncrypted,
    retrieveKeys,
    verifyPassword,
    bsvAddress,
  };
};
