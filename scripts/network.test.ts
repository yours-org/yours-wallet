import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrivateKey, P2PKH, Transaction } from '@bsv/sdk';
import { OneSatServices } from '@1sat/wallet-browser';
import { NetWork } from '../src/services/types/provider.types';
import { getKeys, getKeysFromWifs } from '../src/utils/keys';
import { getChainConfig, getNetworkConfig, isValidAddress, resolveContentUrl } from '../src/utils/network';
import { fetchExchangeRate } from '../src/utils/wallet';
import { parseRawTransaction } from '../src/utils/tools';
import { ChromeStorageService } from '../src/services/ChromeStorage.service';
import { KeysService } from '../src/services/Keys.service';
import { CHROME_STORAGE_OBJECT_VERSION, DEFAULT_STORAGE_REMOTE_URL } from '../src/utils/constants';

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('seed derivation keeps the same keys with distinct addresses on each network', () => {
  const main = getKeys(mnemonic);
  const testnet = getKeys(mnemonic, null, null, null, NetWork.Testnet);
  for (const kind of ['wallet', 'ord', 'identity'] as const) {
    assert.equal(main[`${kind}Wif`], testnet[`${kind}Wif`]);
    assert.equal(main[`${kind}PubKey`], testnet[`${kind}PubKey`]);
    assert.ok(isValidAddress(main[`${kind}Address`], 'main'));
    assert.ok(isValidAddress(testnet[`${kind}Address`], 'test'));
    assert.equal(isValidAddress(main[`${kind}Address`], 'test'), false);
    assert.equal(isValidAddress(testnet[`${kind}Address`], 'main'), false);
  }
  assert.equal(isValidAddress('invalid', 'test'), false);
  assert.equal(isValidAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'main'), false);
});

test('WIF imports accept testnet keys and use the selected address network', () => {
  const key = PrivateKey.fromString('1');
  const keys = getKeysFromWifs({ payPk: key.toWif([0xef]), ordPk: key.toWif([0xef]) }, NetWork.Testnet);
  assert.equal(keys.walletAddress, key.toPublicKey().toAddress('testnet'));
  assert.ok(isValidAddress(keys.identityAddress!, 'test'));
});

test('transaction parsing uses testnet addresses and services', async () => {
  const services = new OneSatServices('test');
  assert.match(services.baseUrl, /testnet/);
  const address = PrivateKey.fromString('1').toPublicKey().toAddress('testnet');
  const tx = new Transaction();
  tx.addOutput({ lockingScript: new P2PKH().lock(address), satoshis: 1000 });
  const parsed = await parseRawTransaction(tx, { services, chain: 'test' } as Parameters<
    typeof parseRawTransaction
  >[1]);
  assert.equal(parsed.txos[0].owner, address);
  assert.match(getChainConfig('test').contentUrl, /testnet/);
  assert.equal(getChainConfig('test').explorerUrl, 'https://test.whatsonchain.com/tx/');
  assert.equal(getNetworkConfig().chain, 'main');
  assert.equal(resolveContentUrl('https://example.com/icon.png', 'test'), 'https://example.com/icon.png');
  assert.match(resolveContentUrl('abc_0', 'test'), /testnet.*abc_0/);
});

test('testnet never uses a fiat exchange rate, including a cached mainnet rate', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return Response.json({ rate: 25 });
  };
  try {
    assert.equal(await fetchExchangeRate('test'), 0);
    assert.equal(requests, 0);
    assert.equal(await fetchExchangeRate('main'), 25);
    assert.equal(await fetchExchangeRate('test'), 0);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the same keys can be stored and switched independently on both networks', async () => {
  const storageArea = (initial: Record<string, unknown> = {}) => {
    const data = initial;
    return {
      get: async (keys: string | string[] | null, callback?: (value: unknown) => void) => {
        const value = structuredClone(
          keys === null
            ? data
            : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, data[key]])),
        );
        callback?.(value);
        return value;
      },
      set: async (value: Record<string, unknown>, callback?: () => void) => {
        Object.assign(data, structuredClone(value));
        callback?.();
      },
      remove: async (key: string) => {
        delete data[key];
      },
    };
  };
  globalThis.chrome = {
    storage: { local: storageArea({ version: CHROME_STORAGE_OBJECT_VERSION }), session: storageArea() },
    runtime: { sendMessage: (_message: unknown, callback: (value: unknown) => void) => callback({ success: true }) },
  } as unknown as typeof chrome;
  const storage = new ChromeStorageService();
  await storage.getAndSetStorage();
  const service = new KeysService(storage);
  const key = PrivateKey.fromString('1').toWif();
  const wifs = { payPk: key, ordPk: key, identityPk: key };
  const main = await service.generateKeysFromWifAndStoreEncrypted('testpassword', wifs, true);
  const testnet = await service.generateKeysFromWifAndStoreEncrypted('testpassword', wifs, false, NetWork.Testnet);
  assert.equal(storage.getAllAccounts().length, 2);
  assert.equal(storage.getChain(), 'test');
  assert.deepEqual(storage.getCurrentAccountObject().account?.storageConfig, {});
  assert.equal((await service.retrieveKeys()).identityAddress, testnet.identityAddress);
  await storage.switchAccount(main.identityAddress!);
  assert.equal(storage.getChain(), 'main');
  assert.equal(storage.getCurrentAccountObject().account?.storageConfig?.activeRemote, DEFAULT_STORAGE_REMOTE_URL);
  assert.equal((await service.retrieveKeys()).walletAddress, main.walletAddress);
  await storage.switchAccount(testnet.identityAddress!);
  assert.equal(storage.getChain(), 'test');
});
