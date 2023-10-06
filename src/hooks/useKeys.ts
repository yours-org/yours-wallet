import { useEffect, useState } from "react";
import {
  decrypt,
  deriveKey,
  encrypt,
  generateRandomSalt,
} from "../utils/crypto";
import { Keys, getKeys } from "../utils/keys";
import { storage } from "../utils/storage";

export type KeyStorage = {
  encryptedKeys: string;
  passKey: string;
  salt: string;
};

export const useKeys = () => {
  const [bsvAddress, setBsvAddress] = useState("");
  const [ordAddress, setOrdAddress] = useState("");
  const [bsvPubKey, setBsvPubKey] = useState("");
  const [ordPubKey, setOrdPubKey] = useState("");
  const generateSeedAndStoreEncrypted = (
    password: string,
    mnemonic?: string
  ) => {
    const salt = generateRandomSalt();
    const passKey = deriveKey(password, salt);
    const keys = getKeys(mnemonic);
    const encryptedKeys = encrypt(JSON.stringify(keys), passKey);
    storage.set({ encryptedKeys, passKey, salt });
    return keys.mnemonic;
  };

  /**
   *
   * @param password An optional password can be passed to unlock sensitive information
   * @returns
   */
  const retrieveKeys = (password?: string): Promise<Keys | Partial<Keys>> => {
    return new Promise((resolve, reject) => {
      storage.get(
        ["encryptedKeys", "passKey", "salt"],
        async (result: KeyStorage) => {
          try {
            if (!result.encryptedKeys || !result.passKey) return;
            const d = decrypt(result.encryptedKeys, result.passKey);
            const keys: Keys = JSON.parse(d);
            setBsvAddress(keys.walletAddress);
            setOrdAddress(keys.ordAddress);
            setBsvPubKey(keys.walletPubKey);
            setOrdPubKey(keys.ordPubKey);
            if (password) {
              const isVerified = await verifyPassword(password);
              isVerified ? resolve(keys) : reject("Unauthorized!");
            } else {
              resolve({
                ordAddress: keys.ordAddress,
                walletAddress: keys.walletAddress,
                walletPubKey: keys.walletPubKey,
                ordPubKey: keys.ordPubKey,
              });
            }
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

  useEffect(() => {
    retrieveKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    generateSeedAndStoreEncrypted,
    retrieveKeys,
    verifyPassword,
    bsvAddress,
    ordAddress,
    bsvPubKey,
    ordPubKey,
  };
};
