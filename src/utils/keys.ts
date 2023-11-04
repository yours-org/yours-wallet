import * as bip39 from 'bip39';
import { ExtendedPrivateKey, PrivateKey } from 'bsv-wasm-web';
import { WifKeys } from '../hooks/useKeys';

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
  lockingWif: string;
  lockingAddress: string;
  lockingPubKey: string;
  lockDerivationPath: string;
};

type DerivationTags = 'wallet' | 'ord' | 'locking';

const getWifAndDerivation = (seedPhrase: string, derivationPath: string) => {
  const seed = bip39.mnemonicToSeedSync(seedPhrase);
  const masterNode = ExtendedPrivateKey.from_seed(seed);
  const childNode = masterNode.derive_from_path(derivationPath);
  const privateKey = childNode.get_private_key();
  const wif = privateKey.to_wif();

  return { wif, derivationPath };
};

const generateKeysFromTag = (mnemonic: string, tag: DerivationTags, customDerivation: string | null = null) => {
  const derivation = customDerivation
    ? customDerivation
    : tag === 'locking'
    ? `m/0'/236'/0'/0/0`
    : tag === 'ord'
    ? `m/44'/236'/1'/0/0`
    : `m/44'/236'/0'/0/0`;
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
  lockingDerivation: string | null = null,
) => {
  if (validMnemonic) {
    const isValid = bip39.validateMnemonic(validMnemonic);
    if (!isValid) throw new Error('Invalid Mnemonic!');
  }
  const mnemonic = validMnemonic ?? bip39.generateMnemonic();
  const wallet = generateKeysFromTag(mnemonic, 'wallet', walletDerivation);
  const ord = generateKeysFromTag(mnemonic, 'ord', ordDerivation);
  const locking = generateKeysFromTag(mnemonic, 'locking', lockingDerivation);

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
    lockingWif: locking.wif,
    lockingAddress: locking.address,
    lockingPubKey: locking.pubKey.to_hex(),
    lockDerivationPath: locking.derivationPath,
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
