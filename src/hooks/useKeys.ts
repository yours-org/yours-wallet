import axios from 'axios';
import init, { ChainParams, P2PKHAddress, PublicKey, Script, SigHash, Transaction, TxIn, TxOut } from 'bsv-wasm-web';
import { useEffect, useState } from 'react';
import {
  DEFAULT_AYM_ORD_PATH,
  DEFAULT_AYM_WALLET_PATH,
  DEFAULT_RELAYX_ORD_PATH,
  DEFAULT_TWETCH_WALLET_PATH,
  FEE_PER_BYTE,
  SWEEP_PATH,
} from '../utils/constants';
import { decrypt, deriveKey, encrypt, generateRandomSalt } from '../utils/crypto';
import { Keys, generateKeysFromTag, getKeys, getKeysFromWifs } from '../utils/keys';
import { NetWork } from '../utils/network';
import { storage } from '../utils/storage';
import { useGorillaPool } from './useGorillaPool';
import { useNetwork } from './useNetwork';
import { usePasswordSetting } from './usePasswordSetting';
import { UTXO, useWhatsOnChain } from './useWhatsOnChain';

export type KeyStorage = {
  encryptedKeys: string;
  passKey: string;
  salt: string;
};

export type WifKeys = {
  payPk: string;
  ordPk: string;
};

export type SupportedWalletImports = 'relayx' | 'twetch' | 'aym' | 'panda' | 'wif';

export const useKeys = () => {
  const [bsvAddress, setBsvAddress] = useState('');
  const [ordAddress, setOrdAddress] = useState('');
  const [identityAddress, setIdentityAddress] = useState('');
  const [bsvPubKey, setBsvPubKey] = useState('');
  const [ordPubKey, setOrdPubKey] = useState('');
  const [identityPubKey, setIdentityPubKey] = useState('');

  const { network } = useNetwork();
  const { isPasswordRequired } = usePasswordSetting();
  const { getBaseUrl } = useWhatsOnChain();
  const { broadcastWithGorillaPool } = useGorillaPool();

  const getChainParams = (network: NetWork): ChainParams => {
    return network === NetWork.Mainnet ? ChainParams.mainnet() : ChainParams.testnet();
  };

  useEffect(() => {
    (async () => {
      await init();
      if (bsvPubKey) {
        const walletAddr = PublicKey.from_hex(bsvPubKey)
          .to_address()
          .set_chain_params(getChainParams(network))
          .to_string();

        setBsvAddress(walletAddr);
      }

      if (ordPubKey) {
        const ordAddr = PublicKey.from_hex(ordPubKey)
          .to_address()
          .set_chain_params(getChainParams(network))
          .to_string();

        setOrdAddress(ordAddr);
      }
    })();
  }, [bsvPubKey, ordPubKey, network]);

  const generateSeedAndStoreEncrypted = (
    password: string,
    mnemonic?: string,
    walletDerivation: string | null = null,
    ordDerivation: string | null = null,
    identityDerivation: string | null = null,
    importWallet?: SupportedWalletImports,
  ) => {
    const salt = generateRandomSalt();
    const passKey = deriveKey(password, salt);
    switch (importWallet) {
      case 'relayx':
        ordDerivation = DEFAULT_RELAYX_ORD_PATH;
        break;
      case 'twetch':
        walletDerivation = DEFAULT_TWETCH_WALLET_PATH;
        break;
      case 'aym':
        walletDerivation = DEFAULT_AYM_WALLET_PATH;
        ordDerivation = DEFAULT_AYM_ORD_PATH;
        break;
    }

    const keys = getKeys(mnemonic, walletDerivation, ordDerivation, identityDerivation);
    if (mnemonic) {
      sweepLegacy(keys);
    }
    const encryptedKeys = encrypt(JSON.stringify(keys), passKey);
    storage.set({ encryptedKeys, passKey, salt });
    return keys.mnemonic;
  };

  const sweepLegacy = async (keys: Keys) => {
    await init();
    const sweepWallet = generateKeysFromTag(keys.mnemonic, SWEEP_PATH);
    const { data } = await axios.get<UTXO[]>(`${getBaseUrl()}/address/${sweepWallet.address}/unspent`);
    const utxos = data;
    if (utxos.length === 0) return;
    const tx = new Transaction(1, 0);
    const changeAddress = P2PKHAddress.from_string(sweepWallet.address);

    let satsIn = 0;
    utxos.forEach((utxo: any, vin: number) => {
      const txin = new TxIn(Buffer.from(utxo.tx_hash, 'hex'), utxo.tx_pos, Script.from_asm_string(''));
      tx.add_input(txin);
      satsIn += utxo.value;
      const sig = tx.sign(
        sweepWallet.privKey,
        SigHash.Input,
        vin,
        changeAddress.get_locking_script(),
        BigInt(utxo.value),
      );
      const asm = `${sig.to_hex()} ${sweepWallet.pubKey.to_hex()}`;
      txin?.set_unlocking_script(Script.from_asm_string(asm));
      tx.set_input(vin, txin);
    });

    const size = tx.to_bytes().length + 34;
    const fee = Math.ceil(size * FEE_PER_BYTE);
    const changeAmount = satsIn - fee;
    tx.add_output(new TxOut(BigInt(changeAmount), P2PKHAddress.from_string(keys.walletAddress).get_locking_script()));

    const rawTx = tx.to_hex();
    const { txid } = await broadcastWithGorillaPool(rawTx);
    console.log('Change sweep:', txid);
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
  const retrieveKeys = (password?: string, isBelowNoApprovalLimit?: boolean): Promise<Keys | Partial<Keys>> => {
    return new Promise((resolve, reject) => {
      storage.get(['encryptedKeys', 'passKey', 'salt'], async (result: KeyStorage) => {
        try {
          await init();
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

          // identity address not available with wif or 1sat import
          if (keys.identityAddress) {
            const identityAddr = P2PKHAddress.from_string(keys.identityAddress)
              .set_chain_params(getChainParams(network))
              .to_string();

            setIdentityAddress(identityAddr);
            setIdentityPubKey(keys.identityPubKey);
          }

          if (!isPasswordRequired || isBelowNoApprovalLimit || password) {
            const isVerified = isBelowNoApprovalLimit || !isPasswordRequired || (await verifyPassword(password ?? ''));
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
    retrieveKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    generateSeedAndStoreEncrypted,
    generateKeysFromWifAndStoreEncrypted,
    retrieveKeys,
    verifyPassword,
    bsvAddress,
    ordAddress,
    identityAddress,
    bsvPubKey,
    ordPubKey,
    identityPubKey,
  };
};
