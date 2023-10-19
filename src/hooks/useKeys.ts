import { useEffect, useState } from "react";
import {
  decrypt,
  deriveKey,
  encrypt,
  generateRandomSalt,
} from "../utils/crypto";
import { Keys, getKeys, getKeysFromWifs } from "../utils/keys";
import { storage } from "../utils/storage";
import { ChainParams, P2PKHAddress } from "bsv-wasm-web";
import { useBsvWasm } from "./useBsvWasm";
import { NetWork } from "../utils/network";
import { useNetwork } from "./useNetwork";

export type KeyStorage = {
  encryptedKeys: string;
  passKey: string;
  salt: string;
};

export type WifKeys = {
  payPk: string;
  ordPk: string;
};

export const useKeys = () => {
  const [bsvAddress, setBsvAddress] = useState("");
  const [ordAddress, setOrdAddress] = useState("");
  const [bsvPubKey, setBsvPubKey] = useState("");
  const [ordPubKey, setOrdPubKey] = useState("");
  const { network } = useNetwork();
  const { bsvWasmInitialized } = useBsvWasm();

  const getChainParams = (network: NetWork): ChainParams => {
    return network === NetWork.Mainnet
      ? ChainParams.mainnet()
      : ChainParams.testnet();
  };

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

  const generateKeysFromWifAndStoreEncrypted = (
    password: string,
    wifs: WifKeys
  ) => {
    const salt = generateRandomSalt();
    const passKey = deriveKey(password, salt);
    const keys = getKeysFromWifs(wifs);
    const encryptedKeys = encrypt(JSON.stringify(keys), passKey);
    storage.set({ encryptedKeys, passKey, salt });
    return keys;
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
            if (!bsvWasmInitialized) throw Error("bsv-wasm not initialized!");
            if (!result.encryptedKeys || !result.passKey) return;
            const d = decrypt(result.encryptedKeys, result.passKey);
            const keys: Keys = JSON.parse(d);

            const walletAddress = P2PKHAddress.from_string(keys.walletAddress)
              .set_chain_params(getChainParams(network))
              .to_string();

            const ordAddress = P2PKHAddress.from_string(keys.ordAddress)
              .set_chain_params(getChainParams(network))
              .to_string();
            setBsvAddress(walletAddress);
            setOrdAddress(ordAddress);
            setBsvPubKey(keys.walletPubKey);
            setOrdPubKey(keys.ordPubKey);
            if (password) {
              const isVerified = await verifyPassword(password);
              isVerified
                ? resolve(
                    Object.assign({}, keys, {
                      ordAddress,
                      walletAddress,
                    })
                  )
                : reject("Unauthorized!");
            } else {
              resolve({
                ordAddress,
                walletAddress,
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
    if (!bsvWasmInitialized) return;
    retrieveKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsvWasmInitialized]);

  return {
    generateSeedAndStoreEncrypted,
    generateKeysFromWifAndStoreEncrypted,
    retrieveKeys,
    verifyPassword,
    bsvAddress,
    ordAddress,
    bsvPubKey,
    ordPubKey,
  };
};
