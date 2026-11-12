import { describe, expect, test } from 'bun:test';
import {
  LockingScript,
  PrivateKey,
  ProtoWallet,
  Transaction,
  WERR_REVIEW_ACTIONS,
  Validation,
  KeyDeriver,
  MerklePath,
} from '@bsv/sdk';
import { InMemoryPermissionStore, LocalWalletPermissionsManager } from '@1sat/wallet';
import { WalletPermissionsManager, Wallet } from '@bsv/wallet-toolbox-client';
import { createRequire } from 'node:module';
import { createStructuredEventCWI } from './cwi-transport';
import { installCwiContentBridge } from './cwi-content';
import { validateCwiRequest } from './cwi-validation';
import { cwiFailure, serializeCwiError } from './cwi-errors';

const peer = PrivateKey.fromRandom().toPublicKey().toString();
const cryptoArgs = { protocolID: [0, 'valid public cwi'], keyID: 'valid key', counterparty: peer };
const signArgs = { reference: 'AQID', spends: {}, options: { returnTXIDOnly: false, noSend: true } };
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function bridge(execute: (action: string, args: any, originator: string) => unknown = () => ({ ok: true })) {
  const target = new EventTarget();
  const calls: any[] = [];
  const received: any[] = [];
  const runtime = {
    lastError: undefined as { message?: string } | undefined,
    sendMessage(message: unknown, reply: (response: unknown) => void) {
      const request = json(message) as any;
      received.push(request);
      Promise.resolve().then(async () => {
        try {
          // This is the same raw-request gate and error codec used by the
          // background listener, with Chrome's JSON serialization both ways.
          validateCwiRequest(request.action, request.params);
          calls.push(request);
          const result = await execute(request.action, request.params, request.originator);
          reply(json({ type: request.action, success: true, data: result }));
        } catch (error) {
          reply(json({ type: request.action, success: false, ...cwiFailure(error) }));
        }
      });
    },
  };
  const close = installCwiContentBridge(target, () => 'customer.example:443', runtime);
  return { wallet: createStructuredEventCWI(target), target, runtime, calls, received, close };
}

async function rejection(action: string, args: unknown, field?: string) {
  const harness = bridge();
  try {
    let caught: any;
    try {
      await (harness.wallet as any)[action](args);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.status).toBe('error');
    expect(typeof caught.code).toBe('string');
    expect(caught.code.length).toBeGreaterThanOrEqual(10);
    expect(caught.description.length).toBeGreaterThanOrEqual(20);
    expect(caught.name).not.toBe('TypeError');
    if (field) expect(caught.message).toContain(field);
    expect(harness.calls).toHaveLength(0);
    expect(harness.received[0].params).toEqual(args);
  } finally {
    harness.close();
  }
}

describe('CWI runtime validation and message round trips', () => {
  for (const [format, WalletClass] of [
    ['ESM', Wallet],
    ['CJS', createRequire(import.meta.url)('@bsv/wallet-toolbox-client').Wallet],
  ] as const) {
    test(`${format} actual Wallet persists, queries and relinquishes the same normalized basket through CWI`, async () => {
      const root = new Transaction(1, [], [{ satoshis: 100, lockingScript: LockingScript.fromHex('51') }], 0);
      const txid = root.id('hex'),
        outpoint = `${txid}.0`,
        keyDeriver = new KeyDeriver(new PrivateKey(21));
      root.merklePath = new MerklePath(1, [[{ offset: 0, hash: txid, txid: true }]]);
      const stored = new Map<string, Set<string>>(),
        calls: any[] = [];
      const storage = {
        setServices() {},
        _authId: { identityKey: keyDeriver.identityKey },
        getSettings: () => ({ storageIdentityKey: keyDeriver.identityKey, storageName: 'Normalization fixture' }),
        async createAction(args: any) {
          calls.push({ method: 'createAction', args: structuredClone(args) });
          throw new Error('Fixture stops before reservation');
        },
        async internalizeAction(args: any) {
          calls.push({ method: 'internalizeAction', args: structuredClone(args) });
          stored.set(args.outputs[0].insertionRemittance.basket, new Set([outpoint]));
          return { accepted: true, txid };
        },
        async listOutputs(args: any) {
          calls.push({ method: 'listOutputs', args: structuredClone(args) });
          const outputs = [...(stored.get(args.basket) ?? [])].map((output) => ({
            outpoint: output,
            satoshis: 100,
            spendable: true,
          }));
          return { outputs, totalOutputs: outputs.length };
        },
        async relinquishOutput(args: any) {
          calls.push({ method: 'relinquishOutput', args: structuredClone(args) });
          return stored.get(args.basket)?.delete(args.output) ? 1 : 0;
        },
      };
      const wallet = new WalletClass({
        chain: 'test',
        keyDeriver,
        storage: storage as any,
        actionBatchMode: 'legacy',
        services: {
          getChainTracker: async () => ({
            isValidRootForHeight: async (hash: string, height: number) => hash === txid && height === 1,
            currentHeight: async () => 10,
          }),
        } as any,
      });
      const harness = bridge((action, args) => (wallet as any)[action](args));
      const basket = '  UPPER fixture tokens  ',
        canonical = 'upper fixture tokens';
      const insertion = {
        tx: root.toAtomicBEEF(),
        description: 'Import normalized basket output',
        labels: ['retained label'],
        seekPermission: false,
        outputs: [
          {
            outputIndex: 0,
            protocol: 'basket insertion',
            insertionRemittance: { basket, tags: ['retained tag'], customInstructions: 'Retain EXACT metadata.' },
          },
        ],
      };
      const original = json(insertion);
      try {
        await expect(
          harness.wallet.createAction({
            description: 'Create normalized basket output',
            outputs: [{ satoshis: 1, lockingScript: '51', basket, outputDescription: 'Normalized recipient output' }],
          }),
        ).rejects.toThrow('Fixture stops before reservation');
        expect(calls[0].args.outputs[0].basket).toBe(canonical);
        await (harness.wallet.internalizeAction as any)(insertion);
        expect(insertion).toEqual(original);
        const imported = calls.find((call) => call.method === 'internalizeAction').args;
        expect(imported.outputs[0].insertionRemittance).toEqual({
          ...insertion.outputs[0].insertionRemittance,
          basket: canonical,
        });
        expect(imported.labels).toEqual(insertion.labels);
        expect(imported.description).toBe(insertion.description);
        expect(imported.seekPermission).toBe(false);
        expect(
          (await harness.wallet.listOutputs({ basket: canonical })).outputs.map((output) => output.outpoint),
        ).toEqual([outpoint]);
        expect((await harness.wallet.listOutputs({ basket })).outputs.map((output) => output.outpoint)).toEqual([
          outpoint,
        ]);
        const removal = { basket, output: outpoint },
          savedRemoval = json(removal);
        expect(await harness.wallet.relinquishOutput(removal)).toEqual({ relinquished: true });
        expect(removal).toEqual(savedRemoval);
        expect(calls.find((call) => call.method === 'relinquishOutput').args).toEqual({
          basket: canonical,
          output: outpoint,
        });
        expect((await harness.wallet.listOutputs({ basket: canonical })).outputs).toEqual([]);
      } finally {
        harness.close();
      }
    });
  }
  for (const [format, Manager] of [
    ['ESM', WalletPermissionsManager],
    ['CJS', createRequire(import.meta.url)('@bsv/wallet-toolbox-client').WalletPermissionsManager],
  ] as const) {
    for (const method of ['discoverByIdentityKey', 'discoverByAttributes'] as const) {
      for (const seekPermission of [false, true, undefined]) {
        test(`${format} ${method} preserves seekPermission=${seekPermission} through CWI and the actual permission manager`, async () => {
          let prompts = 0,
            discoveries = 0;
          const manager = new Manager(
            {
              async listOutputs() {
                return { outputs: [], totalOutputs: 0 };
              },
              async [method]() {
                discoveries++;
                return { certificates: [], totalCertificates: 0 };
              },
            } as any,
            'yours-wallet',
            { seekPermissionsForIdentityResolution: true },
          );
          manager.bindCallback('onProtocolPermissionRequested', async (event: any) => {
            prompts++;
            await manager.denyPermission(event.requestID);
          });
          const harness = bridge((action, args, origin) => (manager as any)[action](args, origin));
          const args = {
            ...(method === 'discoverByIdentityKey' ? { identityKey: peer } : { attributes: { name: 'Alice' } }),
            ...(seekPermission === undefined ? {} : { seekPermission }),
          };
          try {
            await expect((harness.wallet as any)[method](args)).rejects.toThrow();
            expect(prompts).toBe(seekPermission === true ? 1 : 0);
            expect(discoveries).toBe(0);
            expect(harness.calls[0].params).toEqual(args);
          } finally {
            harness.close();
          }
        });
      }
    }
  }
  for (const method of ['discoverByIdentityKey', 'discoverByAttributes'] as const) {
    test(`${method} reuses an existing local identity-resolution grant with seekPermission=false`, async () => {
      const store = new InMemoryPermissionStore();
      let prompts = 0,
        discoveries = 0;
      await store.putGrant({
        key: {
          type: 'protocol',
          originator: 'customer.example',
          privileged: false,
          protocolLevel: 1,
          protocolName: 'identity resolution',
          counterparty: '',
        },
        expiry: 0,
        grantedAt: Date.now(),
      });
      const manager = new LocalWalletPermissionsManager(
        {
          async [method]() {
            discoveries++;
            return { certificates: [], totalCertificates: 0 };
          },
        } as any,
        'yours-wallet',
        { seekPermissionsForIdentityResolution: true },
        { store },
      );
      manager.bindCallback('onProtocolPermissionRequested', async (event: any) => {
        prompts++;
        await manager.denyPermission(event.requestID);
      });
      const harness = bridge((action, args, origin) => (manager as any)[action](args, origin));
      try {
        await expect(
          (harness.wallet as any)[method]({
            ...(method === 'discoverByIdentityKey' ? { identityKey: peer } : { attributes: { name: 'Alice' } }),
            seekPermission: false,
          }),
        ).resolves.toEqual({ certificates: [], totalCertificates: 0 });
        expect(prompts).toBe(0);
        expect(discoveries).toBe(1);
      } finally {
        harness.close();
      }
    });
  }
  const insertionTx = new Transaction(
    1,
    [],
    [{ satoshis: 1, lockingScript: LockingScript.fromHex('51') }],
    0,
  ).toAtomicBEEF();
  const basketCalls = (basket: string): Array<[string, unknown]> => [
    ['listOutputs', { basket }],
    ['relinquishOutput', { basket, output: '01'.repeat(32) + '.0' }],
    [
      'createAction',
      {
        description: 'Basket namespace regression control',
        outputs: [
          { lockingScript: '51', satoshis: 1, outputDescription: 'Valid first output', basket: 'valid first tokens' },
          { lockingScript: '51', satoshis: 1, outputDescription: 'Namespace checked output', basket },
        ],
      },
    ],
    [
      'internalizeAction',
      {
        tx: insertionTx,
        description: 'Basket namespace import control',
        outputs: [{ outputIndex: 0, protocol: 'basket insertion', insertionRemittance: { basket } }],
      },
    ],
  ];

  for (const basket of [
    'a'.repeat(297) + 'é',
    'a'.repeat(298) + 'é',
    'tpnil-uhrp',
    'tpnil_underscore',
    'unicode 💰',
    'abcd',
    'abc  def',
    'abc basket',
    '  abcd  ',
    '  ABC BASKET  ',
    ' DEFAULT ',
    'Admin records',
    ' P tokens',
  ]) {
    for (const [action, args] of basketCalls(basket)) {
      test(`rejects basket namespace characters through ${action} (${Buffer.byteLength(basket)} bytes)`, async () => {
        await rejection(action, args, 'basket');
      });
    }
  }

  for (const basket of [' DEFAULT ', 'Admin records', ' P tokens']) {
    test(`blocks ${JSON.stringify(basket)} before a real manager can route its alias as an ordinary grant`, async () => {
      const store = new InMemoryPermissionStore(),
        originator = 'customer.example';
      await store.putGrant({ key: { type: 'basket', originator, basket }, expiry: 0, grantedAt: Date.now() });
      const reads: string[] = [];
      const manager = new LocalWalletPermissionsManager(
        {
          async listOutputs(args: any) {
            // Actual SDK normalization at the underlying wallet boundary.
            const normalized = Validation.validateListOutputsArgs(args);
            reads.push(normalized.basket);
            return { outputs: [], totalOutputs: 0 };
          },
        } as any,
        'yours-wallet',
        { encryptWalletMetadata: false },
        { store },
      );
      // A direct call reproduces the historical raw routing mismatch. This
      // bypasses the CWI gate deliberately and is not a native-wallet claim.
      await manager.listOutputs({ basket }, originator);
      expect(reads).toEqual([basket.trim().toLowerCase()]);
      reads.length = 0;
      const harness = bridge((action, args, origin) => (manager as any)[action](args, origin));
      try {
        await expect(harness.wallet.listOutputs({ basket })).rejects.toThrow('canonical spelling');
        expect(harness.calls).toHaveLength(0);
        expect(reads).toEqual([]);
      } finally {
        harness.close();
      }
    });
  }

  test('keeps exact reserved spelling on the actual manager reservation and module routes', async () => {
    const store = new InMemoryPermissionStore(),
      reads: string[] = [],
      modules: string[] = [];
    const manager = new LocalWalletPermissionsManager(
      {
        async listOutputs(args: any) {
          reads.push(args.basket);
          return { outputs: [], totalOutputs: 0 };
        },
      } as any,
      'yours-wallet',
      {
        encryptWalletMetadata: false,
        permissionModules: {
          tokens: {
            onRequest: async (request: any) => {
              modules.push(request.args.basket);
              return { args: request.args };
            },
            onResponse: async (response: any) => response,
          },
        },
      },
      { store },
    );
    const harness = bridge((action, args, origin) => (manager as any)[action](args, origin));
    try {
      for (const basket of ['default', 'admin records'])
        await expect(harness.wallet.listOutputs({ basket })).rejects.toThrow('admin-only');
      await harness.wallet.listOutputs({ basket: 'p tokens' });
      expect(modules).toEqual(['p tokens']);
      expect(reads).toEqual(['p tokens']);
    } finally {
      harness.close();
    }
  });

  for (const basket of [
    'abcde',
    '  ABCDE  ',
    'a'.repeat(299),
    'a'.repeat(300),
    '  VALID basket 12  ',
    'p ordinal valid',
  ]) {
    test(`preserves valid basket argument controls (${Buffer.byteLength(basket)} bytes)`, async () => {
      const harness = bridge();
      try {
        for (const [action, args] of basketCalls(basket)) {
          const original = json(args);
          await (harness.wallet as any)[action](args);
          expect(args).toEqual(original);
          expect(harness.calls.at(-1).params).toEqual(original);
        }
        expect(harness.calls).toHaveLength(4);
      } finally {
        harness.close();
      }
    });
  }

  for (const [action, args] of [
    ['signAction', { ...signArgs, options: { ...signArgs.options, returnTXIDOnly: null } }],
    ['signAction', { ...signArgs, spends: null }],
    ['signAction', { ...signArgs, reference: '!invalid!' }],
    ['listActions', { labels: [null] }],
    ['listOutputs', { basket: null }],
    ['listOutputs', { basket: 'valid tokens', tags: [null] }],
    ['relinquishOutput', { basket: null, output: '01'.repeat(32) + '.0' }],
    ['getPublicKey', { ...cryptoArgs, protocolID: [0, 'UPPERCASE cwi'] }],
    ['getPublicKey', { ...cryptoArgs, privileged: null }],
    ['getPublicKey', { ...cryptoArgs, privilegedReason: 'x' }],
    ['encrypt', { ...cryptoArgs, plaintext: [-1] }],
    ['createHmac', { ...cryptoArgs, data: [256] }],
    ['createSignature', { ...cryptoArgs, data: [1], counterparty: null }],
    ['discoverByAttributes', { attributes: null }],
    ['listOutputs', null],
    ['listActions', []],
  ] as const) {
    test(`rejects malformed ${action}: ${JSON.stringify(args)}`, async () => rejection(action, args));
  }

  test('rejects certificate fields before permission lookup and validates an inactive URL', async () => {
    const certificate = {
      type: Buffer.alloc(32, 1).toString('base64'),
      serialNumber: Buffer.alloc(32, 2).toString('base64'),
      certifier: peer,
      revocationOutpoint: '01'.repeat(32) + '.0',
      fields: {},
      signature: '3006020101020101',
      keyringRevealer: 'certifier',
      keyringForSubject: {},
      acquisitionProtocol: 'direct',
    };
    // A valid direct-acquisition argument control reaches the implementation.
    const harness = bridge();
    try {
      await (harness.wallet.acquireCertificate as any)(certificate);
      expect(harness.calls).toHaveLength(1);
    } finally {
      harness.close();
    }
    await rejection('acquireCertificate', { ...certificate, certifierUrl: null });
    await rejection('acquireCertificate', { ...certificate, fields: null });
    await rejection('proveCertificate', {
      certificate: { type: certificate.type, certifier: peer },
      verifier: peer,
      fieldsToReveal: [null],
    });
  });

  test('rejects create-action metadata before encryption and negative numbers before RPC', async () => {
    const output = { lockingScript: '51', satoshis: 1, outputDescription: 'A valid output' };
    const args = { description: 'Create a valid transaction', outputs: [output], options: { noSend: true } };
    const harness = bridge();
    try {
      await harness.wallet.createAction(args);
      expect(harness.calls).toHaveLength(1);
      expect(harness.calls[0].params).toEqual(args);
    } finally {
      harness.close();
    }
    await rejection('createAction', { ...args, description: 'x' }, 'description');
    await rejection('createAction', { ...args, outputs: [{ ...output, outputDescription: 'x' }] }, 'outputDescription');
    await rejection(
      'createAction',
      { ...args, outputs: [{ ...output, customInstructions: null }] },
      'customInstructions',
    );
    await rejection('createAction', { ...args, version: -1 }, 'version');
    await rejection('createAction', { ...args, lockTime: -1 }, 'lockTime');
    await rejection(
      'createAction',
      {
        ...args,
        inputs: [{ outpoint: '01'.repeat(32) + '.0', inputDescription: 'A valid input', unlockingScriptLength: -1 }],
      },
      'unlockingScriptLength',
    );
    await rejection(
      'createAction',
      {
        ...args,
        inputs: [
          {
            outpoint: '01'.repeat(32) + '.0',
            inputDescription: 'A valid input',
            unlockingScriptLength: 0,
            sequenceNumber: -1,
          },
        ],
      },
      'sequenceNumber',
    );
  });

  test('validates internalization remittance and labels before permission parsing', async () => {
    // A real serialized Atomic BEEF control isolates metadata validation from
    // malformed-envelope errors; it is not a funded or broadcast transaction.
    const tx = new Transaction(1, [], [{ satoshis: 1, lockingScript: LockingScript.fromHex('51') }], 0).toAtomicBEEF();
    const insertionRemittance = { basket: 'valid tokens', tags: ['valid tag'] };
    const output = { outputIndex: 0, protocol: 'basket insertion' as const, insertionRemittance };
    const args = { tx, outputs: [output], description: 'Import a valid transaction', labels: ['valid label'] };
    const harness = bridge();
    try {
      await harness.wallet.internalizeAction(args);
      expect(harness.calls).toHaveLength(1);
      expect(harness.calls[0].params).toEqual(args);
    } finally {
      harness.close();
    }
    for (const [change, field] of [
      [{ basket: null }, 'basket'],
      [{ tags: [null] }, 'tag'],
      [{ customInstructions: null }, 'customInstructions'],
    ] as const) {
      await rejection(
        'internalizeAction',
        {
          ...args,
          outputs: [{ ...output, insertionRemittance: { ...insertionRemittance, ...change } }],
        },
        field,
      );
    }
    await rejection('internalizeAction', { ...args, labels: [null] }, 'label');
    await rejection('internalizeAction', { ...args, seekPermission: null }, 'seekPermission');
  });

  test('preserves omitted defaults and explicit false without normalizing the caller', async () => {
    const harness = bridge((_action, args) => ({ received: args }));
    try {
      const args = { ...signArgs, options: { returnTXIDOnly: false, noSend: false } };
      const original = json(args);
      expect(await (harness.wallet.signAction as any)(args)).toEqual({ received: original });
      expect(args).toEqual(original);
      expect(await (harness.wallet.getPublicKey as any)(cryptoArgs)).toEqual({ received: cryptoArgs });
      expect(await harness.wallet.getVersion()).toEqual({ received: {} } as any);
      expect(harness.calls.every((call) => call.originator === 'customer.example:443')).toBe(true);
    } finally {
      harness.close();
    }
  });

  test('keeps valid reserved permission-module requests available to their owner', async () => {
    const harness = bridge();
    try {
      await harness.wallet.getPublicKey({ ...cryptoArgs, protocolID: [0, 'p ordinal valid'] } as any);
      await harness.wallet.listOutputs({ basket: 'p ordinal valid' });
      expect(harness.calls).toHaveLength(2);
    } finally {
      harness.close();
    }
  });

  test('executes valid public crypto through the same boundary', async () => {
    const native = new ProtoWallet(PrivateKey.fromRandom());
    const harness = bridge((action, args) => (native as any)[action](args));
    try {
      const expected = await native.getPublicKey(cryptoArgs as any);
      expect(await harness.wallet.getPublicKey(cryptoArgs as any)).toEqual(expected);
      const encrypted = await harness.wallet.encrypt({ ...cryptoArgs, plaintext: [0, 1, 127, 255] } as any);
      expect(await harness.wallet.decrypt({ ...cryptoArgs, ciphertext: encrypted.ciphertext } as any)).toEqual({
        plaintext: [0, 1, 127, 255],
      });
    } finally {
      harness.close();
    }
  });

  test('preserves a structured failure through the actual event/content/JSON response path', async () => {
    const error = Object.assign(new Error('Permission was explicitly denied by the customer.'), {
      status: 'error',
      code: 'ERR_PERMISSION_DENIED',
      description: 'The customer denied access to this protocol.',
      context: { category: 'protocol', retryable: false },
    });
    const harness = bridge(() => {
      throw error;
    });
    try {
      let actual: any;
      try {
        await harness.wallet.getPublicKey(cryptoArgs as any);
      } catch (caught) {
        actual = caught;
      }
      expect(actual).toBeInstanceOf(Error);
      for (const key of ['status', 'code', 'description', 'context', 'message'])
        expect(actual[key]).toEqual((error as any)[key]);
      expect(harness.calls).toHaveLength(1);
    } finally {
      harness.close();
    }
  });

  test('never trusts a page-supplied originator and never changes successful data', async () => {
    const harness = bridge(() => ({ publicKey: peer }));
    try {
      const result = new Promise<any>((resolve) =>
        harness.target.addEventListener('spoof', (event) => resolve((event as CustomEvent).detail), { once: true }),
      );
      harness.target.dispatchEvent(
        new CustomEvent('YoursRequest', {
          detail: { type: 'getPublicKey', messageId: 'spoof', params: cryptoArgs, originator: 'admin.example' },
        }),
      );
      expect(await result).toEqual({ type: 'getPublicKey', success: true, data: { publicKey: peer } });
      expect(harness.calls[0].originator).toBe('customer.example:443');
    } finally {
      harness.close();
    }
  });

  test('retains actual SDK review-action recovery data across the public boundary', async () => {
    const txid = 'ab'.repeat(32);
    const error = new WERR_REVIEW_ACTIONS(
      [{ txid, status: 'failed' }],
      [{ txid, status: 'failed' }],
      txid,
      [1, 2, 3, 255],
      [`${txid}.0`],
    );
    const harness = bridge(() => {
      throw error;
    });
    try {
      let actual: any;
      try {
        await harness.wallet.signAction(signArgs);
      } catch (caught) {
        actual = caught;
      }
      expect(actual).toBeInstanceOf(Error);
      expect(actual.name).toBe('WERR_REVIEW_ACTIONS');
      expect(actual.code).toBe('WERR_REVIEW_ACTIONS');
      for (const key of ['reviewActionResults', 'sendWithResults', 'txid', 'tx', 'noSendChange'] as const)
        expect(actual[key]).toEqual(error[key]);
    } finally {
      harness.close();
    }
  });

  test('settles synchronous Chrome send failures as structured rejected promises', async () => {
    const target = new EventTarget();
    const close = installCwiContentBridge(target, () => 'customer.example', {
      sendMessage() {
        throw new Error('Extension context invalidated.');
      },
    });
    try {
      const wallet = createStructuredEventCWI(target);
      await expect(wallet.getVersion()).rejects.toMatchObject({
        status: 'error',
        code: 'ERR_WALLET_FAILURE',
        message: 'Extension context invalidated.',
      });
    } finally {
      close();
    }
  });

  test('serializes unknown errors and omits unsafe non-JSON context and private stack/cause', () => {
    const cycle: any = {};
    cycle.self = cycle;
    const error = Object.assign(new Error('Short'), { context: cycle, cause: { secret: 'not copied' } });
    const serialized = serializeCwiError(error);
    expect(serialized.context).toBeUndefined();
    expect(serialized).not.toHaveProperty('stack');
    expect(serialized).not.toHaveProperty('cause');
    expect(serialized.code).toBe('ERR_WALLET_FAILURE');
    expect(serializeCwiError(null).description.length).toBeGreaterThanOrEqual(20);
    expect(new TextEncoder().encode(serializeCwiError('é'.repeat(300)).description).length).toBeLessThanOrEqual(200);
    expect(json(serialized)).toEqual(serialized);
  });

  test('normalizes numeric legacy codes and bounds descriptions without losing the original message', () => {
    for (const message of ['', 'Short', 'é'.repeat(130), '🙂'.repeat(100)]) {
      const value = serializeCwiError(Object.assign(new Error(message), { code: 500 }));
      expect(value.status).toBe('error');
      expect(value.code).toBe('ERR_WALLET_FAILURE');
      expect(value.message).toBe(message);
      expect(new TextEncoder().encode(value.description).length).toBeGreaterThanOrEqual(20);
      expect(new TextEncoder().encode(value.description).length).toBeLessThanOrEqual(200);
      expect(value.description).not.toContain('\uFFFD');
    }
    const specified = serializeCwiError(
      Object.assign(new Error('Original public message'), {
        code: 'ERR_PROTOCOL_PERMISSION',
        description: 'The requested protocol permission was denied.',
      }),
    );
    expect(specified.code).toBe('ERR_PROTOCOL_PERMISSION');
    expect(specified.description).toBe('The requested protocol permission was denied.');
  });
});
