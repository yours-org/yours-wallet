import * as bip39 from "bip39";
import { ExtendedPrivateKey, PrivateKey } from "bsv-wasm-web";

export type Keys = {
  mnemonic: string;
  walletWif: string;
  walletAddress: string;
  ordWif: string;
  ordAddress: string;
  walletPubKey: string;
  ordPubKey: string;
};

const getWif = (seedPhrase: string, isOrd?: boolean) => {
  const seed = bip39.mnemonicToSeedSync(seedPhrase);
  const masterNode = ExtendedPrivateKey.from_seed(seed);

  const derivationPath = `m/44'/236'/${isOrd ? "1" : "0"}'/0/0`;
  const childNode = masterNode.derive_from_path(derivationPath);
  const privateKey = childNode.get_private_key();
  const wif = privateKey.to_wif();

  return wif;
};

export const getKeys = (validMnemonic?: string) => {
  const mnemonic = validMnemonic ?? bip39.generateMnemonic();
  const walletWif = getWif(mnemonic);
  const walletPrivKey = PrivateKey.from_wif(walletWif);
  const walletPubKey = walletPrivKey.to_public_key();
  const walletAddress = walletPubKey.to_address().to_string();

  const ordWif = getWif(mnemonic, true);
  const ordPrivKey = PrivateKey.from_wif(ordWif);
  const ordPubKey = ordPrivKey.to_public_key();
  const ordAddress = ordPubKey.to_address().to_string();

  const keys: Keys = {
    mnemonic,
    walletWif,
    walletAddress,
    ordWif,
    ordAddress,
    walletPubKey: walletPubKey.to_hex(),
    ordPubKey: ordPubKey.to_hex(),
  };

  return keys;
};
