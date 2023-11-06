import { useEffect, useState } from 'react';
import { decrypt, deriveKey, encrypt, generateRandomSalt } from '../utils/crypto';
import { Keys, generateKeysFromTag, getKeys, getKeysFromWifs } from '../utils/keys';
import { storage } from '../utils/storage';
import { ChainParams, P2PKHAddress, Script, SigHash, Transaction, TxIn, TxOut } from 'bsv-wasm-web';
import { useBsvWasm } from './useBsvWasm';
import { NetWork } from '../utils/network';
import { useNetwork } from './useNetwork';
import { usePasswordSetting } from './usePasswordSetting';
import { useWhatsOnChain } from './useWhatsOnChain';
import axios from 'axios';
import { DEFAULT_RELAYX_CHANGE_PATH, DEFAULT_RELAYX_ORD_PATH, FEE_PER_BYTE } from '../utils/constants';
import { useGorillaPool } from './useGorillaPool';

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
  const [bsvAddress, setBsvAddress] = useState('');
  const [ordAddress, setOrdAddress] = useState('');
  const [lockingAddress, setLockingAddress] = useState('');
  const [bsvPubKey, setBsvPubKey] = useState('');
  const [ordPubKey, setOrdPubKey] = useState('');
  const [lockingPubKey, setLockingPubKey] = useState('');

  const { network } = useNetwork();
  const { isPasswordRequired } = usePasswordSetting();
  const { bsvWasmInitialized } = useBsvWasm();
  const { getBaseUrl } = useWhatsOnChain();
  const { broadcastWithGorillaPool } = useGorillaPool();

  const getChainParams = (network: NetWork): ChainParams => {
    return network === NetWork.Mainnet ? ChainParams.mainnet() : ChainParams.testnet();
  };

  const generateSeedAndStoreEncrypted = (
    password: string,
    mnemonic?: string,
    walletDerivation: string | null = null,
    ordDerivation: string | null = null,
    lockingDerivation: string | null = null,
    isRelayX = false,
  ) => {
    const salt = generateRandomSalt();
    const passKey = deriveKey(password, salt);
    if (isRelayX) {
      ordDerivation = DEFAULT_RELAYX_ORD_PATH;
    }
    const keys = getKeys(mnemonic, walletDerivation, ordDerivation, lockingDerivation);
    if (mnemonic && isRelayX) {
      sweepRelayX(keys);
    }
    const encryptedKeys = encrypt(JSON.stringify(keys), passKey);
    storage.set({ encryptedKeys, passKey, salt });
    return keys.mnemonic;
  };

  const sweepRelayX = async (keys: Keys) => {
    if (!bsvWasmInitialized) throw Error('bsv-wasm not initialized!');
    const change = generateKeysFromTag(keys.mnemonic, DEFAULT_RELAYX_CHANGE_PATH);
    const { data: utxos } = await axios.get(`${getBaseUrl()}/address/${change.address}/unspent`);
    const tx = new Transaction(1, 0);
    const changeAddress = P2PKHAddress.from_string(change.address);

    let satsIn = 0;
    utxos.forEach((utxo: any, vin: number) => {
      const txin = new TxIn(Buffer.from(utxo.tx_hash, 'hex'), utxo.tx_pos, Script.from_asm_string(''));
      tx.add_input(txin);
      satsIn += utxo.value;
      const sig = tx.sign(change.privKey, SigHash.Input, vin, changeAddress.get_locking_script(), BigInt(utxo.value));
      // const changeScript = changeAddress.get_unlocking_script(change.privKey.to_public_key(), sig)
      const asm = `${sig.to_hex()} ${change.pubKey.to_hex()}`;
      console.log(asm);
      txin?.set_unlocking_script(Script.from_asm_string(asm));
      tx.set_input(vin, txin);
    });

    const size = tx.to_bytes().length + 34;
    const fee = Math.ceil(size * FEE_PER_BYTE);
    const changeAmount = satsIn - fee;
    tx.add_output(new TxOut(BigInt(changeAmount), P2PKHAddress.from_string(keys.walletAddress).get_locking_script()));

    const rawTx = tx.to_hex();
    const { txid } = await broadcastWithGorillaPool(rawTx);
    console.log('Change sweeep:', txid);
  };

  const generateKeysFromWifAndStoreEncrypted = (password: string, wifs: WifKeys) => {
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
      storage.get(['encryptedKeys', 'passKey', 'salt'], async (result: KeyStorage) => {
        try {
          if (!bsvWasmInitialized) throw Error('bsv-wasm not initialized!');
          if (!result.encryptedKeys || !result.passKey) return;
          const d = decrypt(result.encryptedKeys, result.passKey);
          const keys: Keys = JSON.parse(d);

          const walletAddr = P2PKHAddress.from_string(keys.walletAddress)
            .set_chain_params(getChainParams(network))
            .to_string();

          const ordAddr = P2PKHAddress.from_string(keys.ordAddress)
            .set_chain_params(getChainParams(network))
            .to_string();

          setBsvAddress(walletAddr);
          setOrdAddress(ordAddr);
          setBsvPubKey(keys.walletPubKey);
          setOrdPubKey(keys.ordPubKey);

          // lockingAddress not available with wif or 1sat import
          if (keys.lockingAddress) {
            const lockingAddr = P2PKHAddress.from_string(keys.lockingAddress)
              .set_chain_params(getChainParams(network))
              .to_string();

            setLockingAddress(lockingAddr);
            setLockingPubKey(keys.lockingPubKey);
          }

          if (!isPasswordRequired || password) {
            const isVerified = !isPasswordRequired || (await verifyPassword(password ?? ''));
            isVerified
              ? resolve(
                  Object.assign({}, keys, {
                    ordAddress: ordAddr,
                    walletAddress: walletAddr,
                  }),
                )
              : reject('Unauthorized!');
          } else {
            resolve({
              ordAddress: ordAddr,
              walletAddress: walletAddr,
              walletPubKey: keys.walletPubKey,
              ordPubKey: keys.ordPubKey,
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  };

  const verifyPassword = (password: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!isPasswordRequired) resolve(true);
      storage.get(['salt', 'passKey'], (result: KeyStorage) => {
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
    lockingAddress,
    bsvPubKey,
    ordPubKey,
    lockingPubKey,
  };
};
