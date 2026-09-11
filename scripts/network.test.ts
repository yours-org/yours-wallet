import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrivateKey, P2PKH, Transaction } from '@bsv/sdk';
import { ProcessedTxStoreIdb } from '@1sat/actions';
import { OneSatServices } from '@1sat/wallet-browser';
import { NetWork } from '../src/services/types/provider.types';
import { getKeys, getKeysFromWifs } from '../src/utils/keys';
import { deriveDepositAddresses, remapPromptRequest, withChainAwareSdk } from '../src/utils/chainActions';
import { getChainConfig, getNetworkConfig, isValidAddress, resolveContentUrl, type Chain } from '../src/utils/network';
import { fetchExchangeRate } from '../src/utils/wallet';
import { parseRawTransaction } from '../src/utils/tools';
import { ChromeStorageService } from '../src/services/ChromeStorage.service';
import { KeysService } from '../src/services/Keys.service';
import { CHROME_STORAGE_OBJECT_VERSION, DEFAULT_STORAGE_REMOTE_URL } from '../src/utils/constants';

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const key = PrivateKey.fromString('1');
const publicKey = key.toPublicKey();
const publicKeyHex = publicKey.toString();
const mainAddress = publicKey.toAddress('mainnet');
const testAddress = publicKey.toAddress('testnet');
const wif = key.toWif();

const assertNetworkAddress = (address: string, chain: Chain) => {
  assert.ok(isValidAddress(address, chain));
  assert.equal(isValidAddress(address, chain === 'test' ? 'main' : 'test'), false);
};

const mockChromeStorage = (initial: Record<string, unknown> = {}) => {
  const area = (data: Record<string, unknown> = {}) => ({
    get: async (keys: string | string[] | null, callback?: (value: unknown) => void) => {
      const value = structuredClone(
        keys === null
          ? data
          : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((name) => [name, data[name]])),
      );
      callback?.(value);
      return value;
    },
    set: async (value: Record<string, unknown>, callback?: () => void) => {
      Object.assign(data, structuredClone(value));
      callback?.();
    },
    remove: async (name: string) => {
      delete data[name];
    },
  });
  globalThis.chrome = {
    storage: { local: area(initial), session: area() },
    runtime: { sendMessage: (_message: unknown, callback: (value: unknown) => void) => callback({ success: true }) },
  } as unknown as typeof chrome;
};

test('seed derivation keeps the same keys with distinct addresses on each network', () => {
  const main = getKeys(mnemonic);
  const testnet = getKeys(mnemonic, null, null, null, NetWork.Testnet);
  for (const kind of ['wallet', 'ord', 'identity'] as const) {
    assert.equal(main[`${kind}Wif`], testnet[`${kind}Wif`]);
    assert.equal(main[`${kind}PubKey`], testnet[`${kind}PubKey`]);
    assertNetworkAddress(main[`${kind}Address`], 'main');
    assertNetworkAddress(testnet[`${kind}Address`], 'test');
  }
  assert.equal(isValidAddress('invalid', 'test'), false);
  assert.equal(isValidAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'main'), false);
});

test('WIF imports accept testnet keys and use the selected address network', () => {
  const keys = getKeysFromWifs({ payPk: key.toWif([0xef]), ordPk: key.toWif([0xef]) }, NetWork.Testnet);
  assert.equal(keys.walletAddress, testAddress);
  assertNetworkAddress(keys.identityAddress!, 'test');
});

test('transaction parsing uses testnet addresses and services', async () => {
  const services = new OneSatServices('test');
  assert.match(services.baseUrl, /testnet/);
  const tx = new Transaction();
  tx.addOutput({ lockingScript: new P2PKH().lock(testAddress), satoshis: 1000 });
  const parsed = await parseRawTransaction(tx, { services, chain: 'test' } as Parameters<
    typeof parseRawTransaction
  >[1]);
  assert.equal(parsed.txos[0].owner, testAddress);
  assert.match(getChainConfig('test').contentUrl, /testnet/);
  assert.equal(getChainConfig('test').explorerUrl, 'https://test.whatsonchain.com/tx/');
  assert.equal(getNetworkConfig().chain, 'main');
  assert.equal(resolveContentUrl('https://example.com/icon.png', 'test'), 'https://example.com/icon.png');
  assert.match(resolveContentUrl('abc_0', 'test'), /testnet.*abc_0/);
});

test('deposit derivation remaps SDK mainnet addresses onto the account chain', async () => {
  const { derivations } = await deriveDepositAddresses.execute(
    {
      wallet: { getPublicKey: async () => ({ publicKey: publicKeyHex }) },
      chain: 'test',
      isBaseWallet: true,
    } as Parameters<typeof deriveDepositAddresses.execute>[0],
    { count: 1 },
  );
  assert.equal(derivations[0].address, testAddress);
  assertNetworkAddress(derivations[0].address, 'test');
});

test('testnet SDK workarounds default to testnet addresses and isolate the sync store', async () => {
  await withChainAwareSdk('test', async () => {
    assert.equal(publicKey.toAddress(), testAddress);
    assert.equal(key.toAddress(), testAddress);
    const store = new ProcessedTxStoreIdb('identity-key') as unknown as {
      dbName: string;
      getDb: () => Promise<unknown>;
    };
    await store.getDb().catch(() => undefined);
    assert.equal(store.dbName, 'sync-processed-test-identity-key');
  });
  assert.equal(publicKey.toAddress(), mainAddress);
});

test('permission prompts remap mainnet recipient addresses onto testnet', () => {
  const remapped = remapPromptRequest(
    {
      kind: 'transaction',
      originator: 'example.com',
      summary: `Send to ${mainAddress}`,
      payload: {
        panels: [{ meta: [{ key: 'To', value: mainAddress, copyValue: mainAddress }] }],
        verify: { outputs: [{ recipient: mainAddress }] },
      },
    },
    'test',
  );
  const payload = remapped.payload as {
    panels: Array<{ meta: Array<{ value: string; copyValue: string }> }>;
    verify: { outputs: Array<{ recipient: string }> };
  };
  assert.equal(remapped.summary, `Send to ${testAddress}`);
  assert.equal(payload.panels[0].meta[0].value, testAddress);
  assert.equal(payload.panels[0].meta[0].copyValue, testAddress);
  assert.equal(payload.verify.outputs[0].recipient, testAddress);
  assert.equal(
    remapPromptRequest({ kind: 'transaction', originator: '', summary: mainAddress, payload: {} }, 'main').summary,
    mainAddress,
  );
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
  mockChromeStorage({ version: CHROME_STORAGE_OBJECT_VERSION });
  const storage = new ChromeStorageService();
  await storage.getAndSetStorage();
  const service = new KeysService(storage);
  const wifs = { payPk: wif, ordPk: wif, identityPk: wif };
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
