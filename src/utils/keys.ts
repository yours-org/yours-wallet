import * as bip39 from 'bip39';
import { DerivationTag, NetWork } from 'yours-wallet-provider';
import { WifKeys } from '../services/types/keys.types';
import { DEFAULT_IDENTITY_PATH, DEFAULT_ORD_PATH, DEFAULT_WALLET_PATH } from './constants';
import { convertAddressToTestnet } from './tools';
import { BigNumber, Hash, HD, Mnemonic, PrivateKey, Utils } from '@bsv/sdk';

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

const getWifAndDerivation = (seedPhrase: string, derivationPath: string) => {
  const seed = Mnemonic.fromString(seedPhrase).toSeed();
  const masterNode = HD.fromSeed(seed);
  const childNode = derivationPath === 'm' ? masterNode : masterNode.derive(derivationPath);
  const privateKey = childNode.privKey;
  const wif = privateKey.toWif();

  return { wif, derivationPath };
};

export const generateKeysFromTag = (mnemonic: string, derivation: string) => {
  const wifAndDp = getWifAndDerivation(mnemonic, derivation);
  const privKey = PrivateKey.fromWif(wifAndDp.wif);
  const pubKey = privKey.toPublicKey();
  const address = pubKey.toAddress();
  return {
    wif: wifAndDp.wif,
    derivationPath: wifAndDp.derivationPath,
    privKey,
    pubKey,
    address,
  };
};

export const getKeys = (
  network: NetWork,
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
  const walletAddress = network === NetWork.Testnet ? convertAddressToTestnet(wallet.address) : wallet.address;
  const ordAddress = network === NetWork.Testnet ? convertAddressToTestnet(ord.address) : ord.address;
  const identityAddress = network === NetWork.Testnet ? convertAddressToTestnet(identity.address) : identity.address;

  const keys: Keys = {
    mnemonic,
    walletWif: wallet.wif,
    walletAddress,
    walletPubKey: wallet.pubKey.toString(),
    walletDerivationPath: wallet.derivationPath,
    ordWif: ord.wif,
    ordAddress,
    ordPubKey: ord.pubKey.toString(),
    ordDerivationPath: ord.derivationPath,
    identityWif: identity.wif,
    identityAddress,
    identityPubKey: identity.pubKey.toString(),
    identityDerivationPath: identity.derivationPath,
  };

  return keys;
};

export const getKeysFromWifs = (wifs: WifKeys) => {
  const walletPrivKey = PrivateKey.fromWif(wifs.payPk);
  const walletPubKey = walletPrivKey.toPublicKey();
  const walletAddress = walletPubKey.toAddress();

  const ordPrivKey = PrivateKey.fromWif(wifs.ordPk);
  const ordPubKey = ordPrivKey.toPublicKey();
  const ordAddress = ordPubKey.toAddress();

  let identityPrivKey: PrivateKey | undefined;
  if (wifs.identityPk) {
    identityPrivKey = PrivateKey.fromWif(wifs.identityPk);
  } else {
    const privBuf = walletPrivKey.toArray().concat(ordPrivKey.toArray());
    while (!identityPrivKey) {
      const bn = new BigNumber(Hash.sha256(privBuf));
      if (bn.lt(new BigNumber('ffffffff ffffffff ffffffff fffffffe baaedce6 af48a03b bfd25e8c d0364141', 16))) {
        identityPrivKey = PrivateKey.fromString(bn.toHex(), 'hex');
      }
    }
  }

  const identityPubKey = identityPrivKey.toPublicKey();
  const identityAddress = identityPubKey.toAddress();

  const keys: Partial<Keys> = {
    walletWif: wifs.payPk,
    walletAddress,
    ordWif: wifs.ordPk,
    ordAddress,
    walletPubKey: walletPubKey.toString(),
    ordPubKey: ordPubKey.toString(),
    identityWif: identityPrivKey.toWif(),
    identityAddress,
    identityPubKey: identityPubKey.toString(),
  };

  return keys;
};

const getTaggedDerivation = (tag: DerivationTag): string => {
  const labelHex = Utils.toHex(Hash.sha256(tag.label, 'utf8'));
  const idHex = Utils.toHex(Hash.sha256(tag.id, 'utf8'));
  const labelNumber = parseInt(labelHex.slice(-8), 16) % 2 ** 31;
  const idNumber = parseInt(idHex.slice(-8), 16) % 2 ** 31;
  return `m/44'/236'/218'/${labelNumber}/${idNumber}`;
};

export const getTaggedDerivationKeys = (tag: DerivationTag, mnemonic: string) => {
  const taggedDerivation = getTaggedDerivation(tag);
  return generateKeysFromTag(mnemonic, taggedDerivation);
};

export const getPrivateKeyFromTag = (tag: DerivationTag, keys: Keys) => {
  if (tag.label === 'panda' || tag.label === 'yours') {
    switch (tag.id) {
      case 'bsv':
        return PrivateKey.fromWif(keys.walletWif);
      case 'ord':
        return PrivateKey.fromWif(keys.ordWif);
      case 'identity':
        return PrivateKey.fromWif(keys.identityWif);
      default:
        return PrivateKey.fromWif(keys.identityWif);
    }
  } else {
    const taggedKeys = getTaggedDerivationKeys(tag, keys.mnemonic);
    return taggedKeys.privKey;
  }
};
