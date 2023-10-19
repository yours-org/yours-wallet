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
  walletDerivationPath: string;
  ordDerivationPath: string;
};

const getWifAndDerivation = (seedPhrase: string, isOrd?: boolean) => {
  const seed = bip39.mnemonicToSeedSync(seedPhrase);
  const masterNode = ExtendedPrivateKey.from_seed(seed);
  const derivationPath = `m/44'/236'/${isOrd ? "1" : "0"}'/0/0`;
  const childNode = masterNode.derive_from_path(derivationPath);
  const privateKey = childNode.get_private_key();
  const wif = privateKey.to_wif();

  return { wif, derivationPath };
};

export const getKeys = (validMnemonic?: string) => {
  if (validMnemonic) {
    const isValid = bip39.validateMnemonic(validMnemonic);
    if (!isValid) throw new Error("Invalid Mnemonic!");
  }
  const mnemonic = validMnemonic ?? bip39.generateMnemonic();
  const walletWifAndDP = getWifAndDerivation(mnemonic);
  const walletPrivKey = PrivateKey.from_wif(walletWifAndDP.wif);
  const walletPubKey = walletPrivKey.to_public_key();
  const walletAddress = walletPubKey.to_address().to_string();

  const ordWifAndDP = getWifAndDerivation(mnemonic, true);
  const ordPrivKey = PrivateKey.from_wif(ordWifAndDP.wif);
  const ordPubKey = ordPrivKey.to_public_key();
  const ordAddress = ordPubKey.to_address().to_string();

  const keys: Keys = {
    mnemonic,
    walletWif: walletWifAndDP.wif,
    walletAddress,
    ordWif: walletWifAndDP.wif,
    ordAddress,
    walletPubKey: walletPubKey.to_hex(),
    ordPubKey: ordPubKey.to_hex(),
    walletDerivationPath: walletWifAndDP.derivationPath,
    ordDerivationPath: ordWifAndDP.derivationPath,
  };

  return keys;
};
