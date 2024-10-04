import { PrivateKey } from '@bsv/sdk';
import { SPVStore, TxoLookup, TxoSort } from 'spv-store';
import { DerivationTag, NetWork, TaggedDerivationResponse } from 'yours-wallet-provider';
import { decryptUsingPrivKey } from '../utils/crypto';
import { getTaggedDerivationKeys, Keys } from '../utils/keys';
import { convertAddressToMainnet, convertAddressToTestnet } from '../utils/tools';
import { ChromeStorageService } from './ChromeStorage.service';
import { ChromeStorageObject } from './types/chromeStorage.types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deepMerge = <T extends Record<string, any>>(target: T, source: Partial<T>): T => {
  for (const key of Object.keys(source) as Array<keyof T>) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) {
        target[key] = {} as T[keyof T];
      }
      deepMerge(target[key], source[key] as Partial<T[keyof T]>);
    } else {
      target[key] = source[key] as T[keyof T];
    }
  }
  return target;
};

export const setDerivationTags = async (
  keys: Keys,
  oneSatSPV: SPVStore,
  chromeStorageService: ChromeStorageService,
) => {
  const ordsWithPandaTag = await oneSatSPV.search(
    new TxoLookup('origin', 'type', 'panda/tag', keys.identityAddress),
    TxoSort.DESC,
    0,
  );

  const ordsWithYoursTag = await oneSatSPV.search(
    new TxoLookup('origin', 'type', 'yours/tag', keys.identityAddress),
    TxoSort.DESC,
    0,
  );

  const taggedOrds = ordsWithPandaTag.txos.concat(ordsWithYoursTag.txos);
  const tags: TaggedDerivationResponse[] = [];
  const network = chromeStorageService.getNetwork();
  for (const ord of taggedOrds) {
    try {
      const content = ord.data.origin.data?.insc?.file?.content;
      if (!content) continue;
      const contentBuffer = Buffer.from(content);
      if (!contentBuffer || contentBuffer.length === 0) continue;
      const derivationTag = decryptUsingPrivKey(
        [Buffer.from(contentBuffer).toString('base64')],
        PrivateKey.fromWif(keys.identityWif),
      );
      const parsedTag: DerivationTag = JSON.parse(Buffer.from(derivationTag[0], 'base64').toString('utf8'));
      const taggedKeys = getTaggedDerivationKeys(parsedTag, keys.mnemonic);
      const taggedAddress =
        network === NetWork.Mainnet
          ? convertAddressToMainnet(taggedKeys.address)
          : convertAddressToTestnet(taggedKeys.address);
      tags.push({ tag: parsedTag, address: taggedAddress, pubKey: taggedKeys.pubKey.toString() });
    } catch (error) {
      console.log(error);
    }
  }
  const { account } = chromeStorageService.getCurrentAccountObject();
  if (!account) throw new Error('No account found!');
  const key: keyof ChromeStorageObject = 'accounts';
  const update: Partial<ChromeStorageObject['accounts']> = {
    [account.addresses.identityAddress]: {
      ...account,
      derivationTags: tags,
    },
  };
  await chromeStorageService.updateNested(key, update);
};
