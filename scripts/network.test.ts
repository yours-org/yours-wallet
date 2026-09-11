import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { PrivateKey, PublicKey, P2PKH, Transaction } from '@bsv/sdk';
import { ProcessedTxStoreIdb, type OneSatContext } from '@1sat/actions';
import { OneSatServices } from '@1sat/wallet-browser';
import { NetWork } from '../src/services/types/provider.types';
import { getKeys, getKeysFromWifs } from '../src/utils/keys';
import { deriveDepositAddresses, remapPromptRequest, syncAddresses } from '../src/utils/chainActions';
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

const mockSyncStore = (t: TestContext) => {
  t.mock.method(ProcessedTxStoreIdb.prototype, 'getLastScore', async () => 0);
  t.mock.method(ProcessedTxStoreIdb.prototype, 'has', async () => false);
  t.mock.method(ProcessedTxStoreIdb.prototype, 'add', async () => {});
  const setScore = t.mock.method(ProcessedTxStoreIdb.prototype, 'setLastScore', async () => {});
  const close = t.mock.method(ProcessedTxStoreIdb.prototype, 'close', async () => {});
  return { setScore, close };
};

const syncWallet = {
  getPublicKey: async () => ({ publicKey: publicKeyHex }),
  getHeight: async () => ({ height: 110 }),
  listOutputs: async () => ({ outputs: [] }),
};

test("overlapping syncs keep SDK defaults and each network's addresses separate", async (t) => {
  const { close } = mockSyncStore(t);
  const publicToAddress = PublicKey.prototype.toAddress;
  const privateToAddress = PrivateKey.prototype.toAddress;
  const run = async (chain: Chain) => {
    const ctx = {
      wallet: syncWallet,
      chain,
      isBaseWallet: true,
      services: {
        owner: {
          async *sync(addresses: string[]) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            addresses.forEach((address) => assertNetworkAddress(address, chain));
            assert.equal(publicKey.toAddress(), mainAddress);
            assert.equal(PublicKey.prototype.toAddress, publicToAddress);
            assert.equal(PrivateKey.prototype.toAddress, privateToAddress);
          },
        },
      },
    } as unknown as OneSatContext;
    return syncAddresses.execute(ctx, { count: 1 });
  };
  const [main, testnet] = await Promise.all([run('main'), run('test')]);
  assert.deepEqual(main.addresses, [mainAddress]);
  assert.deepEqual(testnet.addresses, [testAddress]);
  assert.equal(close.mock.callCount(), 2);
});

test('sync retries failed transactions before advancing its cursor', async (t) => {
  const { setScore, close } = mockSyncStore(t);
  t.mock.method(console, 'error', () => {});
  let spent = false;
  const ctx = {
    wallet: syncWallet,
    chain: 'test',
    isBaseWallet: true,
    services: {
      owner: {
        async *sync() {
          yield { outpoint: `${'a'.repeat(64)}_0`, score: 100, spendTxid: spent ? 'spent' : undefined };
        },
      },
      beef: {
        getBeef: async () => {
          throw new Error('Unavailable');
        },
      },
    },
  } as unknown as OneSatContext;
  assert.equal((await syncAddresses.execute(ctx, {})).failed, 1);
  assert.equal(setScore.mock.callCount(), 0);
  spent = true;
  assert.equal((await syncAddresses.execute(ctx, {})).processed, 1);
  assert.deepEqual(setScore.mock.calls[0].arguments, [100]);
  assert.equal(close.mock.callCount(), 2);
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
