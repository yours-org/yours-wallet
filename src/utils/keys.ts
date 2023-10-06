import * as bip39 from "bip39";
import * as bsv from "bsv";

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
  const masterNode = bsv.HDPrivateKey.fromSeed(seed);

  const derivationPath = `m/44'/236'/${isOrd ? "1" : "0"}'/0/0`;
  const childNode = masterNode.deriveChild(derivationPath);

  if (!childNode.privateKey) return;

  const wif = childNode.privateKey.toWIF();

  return wif;
};

export const getKeys = (validMnemonic?: string) => {
  let mnemonic = validMnemonic ?? bip39.generateMnemonic();
  const walletWif = getWif(mnemonic);
  const walletPrivKey = bsv.PrivateKey.fromWIF(walletWif);
  const walletPubKey = walletPrivKey.toPublicKey();
  const walletAddress = walletPubKey.toAddress().toString();

  const ordWif = getWif(mnemonic, true);
  const ordPrivKey = bsv.PrivateKey.fromWIF(ordWif);
  const ordPubKey = ordPrivKey.toPublicKey();
  const ordAddress = ordPubKey.toAddress().toString();

  const keys: Keys = {
    mnemonic,
    walletWif,
    walletAddress,
    ordWif,
    ordAddress,
    walletPubKey: walletPubKey.toString(),
    ordPubKey: ordPubKey.toString(),
  };

  return keys;
};
