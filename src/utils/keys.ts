import * as bip39 from 'bip39';
import { ExtendedPrivateKey, PrivateKey } from 'bsv-wasm-web';
import { WifKeys } from '../hooks/useKeys';
import { DEFAULT_IDENTITY_PATH, DEFAULT_ORD_PATH, DEFAULT_WALLET_PATH } from './constants';

export type Keys = {
  mnemonic: string;
  walletWif: string;
  walletAddress: string;
  walletPubKey: string;
  walletDerivationPath: string;
  ordWif: string;
  ordAddress: string;
  ordPubKey: string;
  ordDerivationPath: string;
  identityWif: string;
  identityAddress: string;
  identityPubKey: string;
  identityDerivationPath: string;
};

export type DerivationTags = 'wallet' | 'ord' | 'identity';

const getWifAndDerivation = (seedPhrase: string, derivationPath: string) => {
  const seed = bip39.mnemonicToSeedSync(seedPhrase);
  const masterNode = ExtendedPrivateKey.from_seed(seed);
  const childNode = masterNode.derive_from_path(derivationPath);
  const privateKey = childNode.get_private_key();
  const wif = privateKey.to_wif();

  return { wif, derivationPath };
};

export const generateKeysFromTag = (mnemonic: string, derivation: string) => {
  const wifAndDp = getWifAndDerivation(mnemonic, derivation);
  const privKey = PrivateKey.from_wif(wifAndDp.wif);
  const pubKey = privKey.to_public_key();
  const address = pubKey.to_address().to_string();
  return {
    wif: wifAndDp.wif,
    derivationPath: wifAndDp.derivationPath,
    privKey,
    pubKey,
    address,
  };
};

export const getKeys = (
  validMnemonic?: string,
  walletDerivation: string | null = null,
  ordDerivation: string | null = null,
  identityDerivation: string | null = null,
) => {
  if (validMnemonic) {
    const isValid = bip39.validateMnemonic(validMnemonic);
    if (!isValid) throw new Error('Invalid Mnemonic!');
  }
  const mnemonic = validMnemonic ?? bip39.generateMnemonic();
  const wallet = generateKeysFromTag(mnemonic, walletDerivation || DEFAULT_WALLET_PATH);
  const ord = generateKeysFromTag(mnemonic, ordDerivation || DEFAULT_ORD_PATH);
  const identity = generateKeysFromTag(mnemonic, identityDerivation || DEFAULT_IDENTITY_PATH);

  const keys: Keys = {
    mnemonic,
    walletWif: wallet.wif,
    walletAddress: wallet.address,
    walletPubKey: wallet.pubKey.to_hex(),
    walletDerivationPath: wallet.derivationPath,
    ordWif: ord.wif,
    ordAddress: ord.address,
    ordPubKey: ord.pubKey.to_hex(),
    ordDerivationPath: ord.derivationPath,
    identityWif: identity.wif,
    identityAddress: identity.address,
    identityPubKey: identity.pubKey.to_hex(),
    identityDerivationPath: identity.derivationPath,
  };

  return keys;
};

export const getKeysFromWifs = (wifs: WifKeys) => {
  const walletPrivKey = PrivateKey.from_wif(wifs.payPk);
  const walletPubKey = walletPrivKey.to_public_key();
  const walletAddress = walletPubKey.to_address().to_string();

  const ordPrivKey = PrivateKey.from_wif(wifs.ordPk);
  const ordPubKey = ordPrivKey.to_public_key();
  const ordAddress = ordPubKey.to_address().to_string();

  const keys: Partial<Keys> = {
    walletWif: wifs.payPk,
    walletAddress,
    ordWif: wifs.ordPk,
    ordAddress,
    walletPubKey: walletPubKey.to_hex(),
    ordPubKey: ordPubKey.to_hex(),
  };

  return keys;
};
