import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { InMemoryPermissionStore, LocalWalletPermissionsManager } from '@1sat/wallet';
import { makeBrc153ReferenceLabel, WalletPermissionsManager, sdk as toolboxSdk } from '@bsv/wallet-toolbox-client';
import { LockingScript, Transaction, UnlockingScript, WERR_REVIEW_ACTIONS } from '@bsv/sdk';
import type { CreateActionArgs, SignActionArgs, WalletInterface } from '@bsv/sdk';

import { createStructuredEventCWI } from './cwi-transport';
import { installCwiContentBridge } from './cwi-content';
import { validateCwiRequest } from './cwi-validation';
import { cwiFailure } from './cwi-errors';

const originator = 'options.itcve.test';
const admin = 'yours-wallet';

// Actual public manager, validation, permission store, fee calculation and BEEF
// binding; only the underlying wallet/storage transport is a deterministic fixture.
async function fixture({ deny = false, commonjs = false } = {}) {
  const store = new InMemoryPermissionStore();
  if (!deny)
    await store.putGrant({
      key: { type: 'spending', originator },
      expiry: 0,
      grantedAt: Date.now(),
      authorizedAmount: 100,
    });
  const source = new Transaction(1, [], [{ satoshis: 1000, lockingScript: LockingScript.fromHex('51') }], 0);
  const created: CreateActionArgs[] = [],
    signed: SignActionArgs[] = [],
    aborted: string[] = [],
    prompts: any[] = [];
  const pending = new Map<string, { tx: Transaction; args: CreateActionArgs }>();
  let next = 0,
    reserved = false;
  let failAbort: 'throw' | 'unconfirmed' | undefined;
  let signFailure: unknown;
  let finalMutation: ((tx: Transaction) => void) | undefined;
  let omitFullTx = false;
  const underlying = {
    async createAction(args: CreateActionArgs) {
      if (reserved) throw new Error('Fixture source is already reserved');
      created.push(structuredClone(args));
      const reference = Buffer.from(`options-${next++}`).toString('base64');
      const tx = new Transaction(
        1,
        [
          {
            sourceTransaction: source,
            sourceOutputIndex: 0,
            sequence: 0xffffffff,
            unlockingScript: UnlockingScript.fromHex(args.inputs?.[0]?.unlockingScriptLength !== undefined ? '' : '51'),
          },
        ],
        [
          { satoshis: 11, lockingScript: LockingScript.fromHex('51') },
          { satoshis: 966, lockingScript: LockingScript.fromHex('51') },
        ],
        0,
      );
      reserved = true;
      if (args.options?.signAndProcess === true)
        return { txid: tx.id('hex'), ...(args.options.returnTXIDOnly ? {} : { tx: tx.toAtomicBEEF() }) };
      pending.set(reference, { tx, args });
      return { signableTransaction: { reference, tx: tx.toAtomicBEEF() }, noSendChange: [`${tx.id('hex')}.1`] };
    },
    async signAction(args: SignActionArgs) {
      signed.push(structuredClone(args));
      if (signFailure) throw signFailure;
      const item = pending.get(args.reference);
      if (!item) throw new Error('Fixture reference is absent');
      for (const [index, spend] of Object.entries(args.spends)) {
        if (index !== '0' || spend.unlockingScript !== '51') throw new Error('Fixture invalid input spend');
      }
      const tx = Transaction.fromAtomicBEEF(item.tx.toAtomicBEEF());
      for (const [index, spend] of Object.entries(args.spends))
        tx.inputs[Number(index)].unlockingScript = UnlockingScript.fromHex(spend.unlockingScript);
      finalMutation?.(tx);
      return {
        txid: tx.id('hex'),
        ...(omitFullTx || args.options?.returnTXIDOnly ? {} : { tx: tx.toAtomicBEEF() }),
        sendWithResults: [],
        notDelayedResults: [{ txid: tx.id('hex'), status: 'success' }],
      };
    },
    async abortAction({ reference }: { reference: string }) {
      aborted.push(reference);
      if (failAbort === 'throw') throw new Error('Fixture abort unavailable');
      if (failAbort === 'unconfirmed') return { aborted: false };
      pending.delete(reference);
      reserved = false;
      return { aborted: true as const };
    },
    async listActions() {
      return {
        totalActions: pending.size,
        actions: [...pending].map(([reference, { args }]) => ({
          txid: 'ab'.repeat(32),
          satoshis: -34,
          status: 'unsigned',
          isOutgoing: true,
          description: 'Option test staged debit',
          version: 1,
          lockTime: 0,
          labels: [...args.labels!, makeBrc153ReferenceLabel(reference)],
        })),
      };
    },
    async listOutputs() {
      return { totalOutputs: 0, outputs: [] };
    },
  };
  const manager = commonjs
    ? new (createRequire(import.meta.url)('@bsv/wallet-toolbox-client')
        .WalletPermissionsManager as typeof WalletPermissionsManager)(underlying as unknown as WalletInterface, admin, {
        encryptWalletMetadata: false,
        seekSpendingPermissions: false,
      })
    : new LocalWalletPermissionsManager(
        underlying as unknown as WalletInterface,
        admin,
        { encryptWalletMetadata: false, seekGroupedPermission: false, seekPermissionWhenApplyingActionLabels: false },
        { store },
      );
  manager.bindCallback('onSpendingAuthorizationRequested', async (event: any) => {
    prompts.push(event);
    await manager.denyPermission(event.requestID);
  });
  const create = (
    options?: CreateActionArgs['options'],
    caller = originator,
    labels?: string[],
    inputs?: CreateActionArgs['inputs'],
  ) =>
    manager.createAction(
      {
        labels,
        inputs,
        ...(inputs ? { inputBEEF: source.toAtomicBEEF() } : {}),
        description: 'Permission-safe option regression',
        outputs: [{ satoshis: 11, lockingScript: '51', outputDescription: 'Test recipient' }],
        options,
      },
      caller,
    );
  const sign = (reference: string, options?: SignActionArgs['options'], caller = originator) =>
    manager.signAction({ reference, spends: {}, options }, caller);
  return {
    manager,
    create,
    sign,
    created,
    signed,
    aborted,
    pending,
    prompts,
    source,
    setFinalMutation: (fn: typeof finalMutation) => (finalMutation = fn),
    omitFullTx: () => (omitFullTx = true),
    failSign: (error: unknown) => (signFailure = error),
    failAbort: (mode: 'throw' | 'unconfirmed' = 'throw') => (failAbort = mode),
    reserved: () => reserved,
  };
}

function onlyTxid(result: any) {
  expect(result.txid).toMatch(/^[0-9a-f]{64}$/);
  expect(Object.hasOwn(result, 'tx')).toBe(false);
  expect(JSON.parse(JSON.stringify(result)).tx).toBeUndefined();
  expect(result.signableTransaction).toBeUndefined();
}

describe('permission-safe public transaction options', () => {
  test.each([undefined, true])(
    'non-admin signAndProcess %s stages, authorizes the fee-inclusive spend and finalizes',
    async (signAndProcess) => {
      const f = await fixture();
      const result = await f.create({ signAndProcess });
      expect(f.created[0].options?.signAndProcess).toBe(false);
      expect(f.signed).toHaveLength(1);
      expect(f.signed[0].options?.returnTXIDOnly).toBe(false);
      expect(f.prompts).toHaveLength(0);
      expect(result.tx).toBeDefined();
      expect(result.signableTransaction).toBeUndefined();
      expect(Transaction.fromAtomicBEEF(result.tx!).getFee()).toBe(23);
    },
  );
  test('explicit true cannot bypass a denied spending request and releases the reserved input', async () => {
    const f = await fixture({ deny: true });
    await expect(f.create({ signAndProcess: true })).rejects.toThrow();
    expect(f.created[0].options?.signAndProcess).toBe(false);
    expect(f.prompts).toHaveLength(1);
    expect(f.prompts[0].spending.satoshis).toBe(34);
    expect(f.signed).toHaveLength(0);
    expect(f.aborted).toHaveLength(1);
    expect(f.reserved()).toBe(false);
    await expect(f.manager.signAction({ reference: f.aborted[0], spends: {} }, originator)).rejects.toThrow(
      'not issued',
    );
  });
  test('explicit false remains staged until a separate authorized sign request', async () => {
    const f = await fixture();
    const staged = await f.create({ signAndProcess: false });
    expect(staged.tx).toBeUndefined();
    expect(staged.txid).toBeUndefined();
    expect(f.signed).toHaveLength(0);
    const result = await f.sign(staged.signableTransaction!.reference);
    expect(result.tx).toBeDefined();
    expect(f.signed).toHaveLength(1);
  });
  test('explicit true with an unfinished caller input still returns a staged action', async () => {
    const f = await fixture();
    const options = { signAndProcess: true, returnTXIDOnly: true };
    const result = await f.create(options, originator, undefined, [
      { outpoint: `${f.source.id('hex')}.0`, unlockingScriptLength: 1, inputDescription: 'Caller-signed source' },
    ]);
    expect(options).toEqual({ signAndProcess: true, returnTXIDOnly: true });
    expect(result.txid).toBeUndefined();
    expect(result.signableTransaction?.tx.length).toBeGreaterThan(0);
    expect(f.signed).toHaveLength(0);
    onlyTxid(
      await f.manager.signAction(
        { reference: result.signableTransaction!.reference, spends: { 0: { unlockingScript: '51' } }, options: {} },
        originator,
      ),
    );
  });
  test('admin explicit false still stages instead of silently finalizing', async () => {
    const f = await fixture();
    const result = await f.create({ signAndProcess: false }, admin);
    expect(f.created[0].options?.signAndProcess).toBe(false);
    expect(result.signableTransaction).toBeDefined();
    expect(f.signed).toHaveLength(0);
  });
  test('explicit true retains the trusted admin direct path', async () => {
    const f = await fixture({ deny: true });
    const result = await f.create({ signAndProcess: true, returnTXIDOnly: true }, admin);
    expect(f.created[0].options?.signAndProcess).toBe(true);
    expect(f.signed).toHaveLength(0);
    expect(f.prompts).toHaveLength(0);
    onlyTxid(result);
  });
  test.each([undefined, true])(
    'createAction returnTXIDOnly projects only after full verification, signAndProcess %s',
    async (signAndProcess) => {
      const f = await fixture();
      const result = await f.create({ signAndProcess, returnTXIDOnly: true, noSend: true });
      onlyTxid(result);
      expect(f.signed[0].options?.returnTXIDOnly).toBe(false);
      expect(result.noSendChange).toEqual([`${result.txid}.1`]);
      await expect(f.manager.abortAction({ reference: result.txid! }, originator)).resolves.toEqual({ aborted: true });
    },
  );
  test.each([
    [true, undefined, true],
    [true, false, false],
    [false, true, true],
    [undefined, true, true],
    [false, undefined, false],
  ] as const)('signAction create=%s sign=%s yields txidOnly=%s', async (createOption, signOption, expected) => {
    const f = await fixture();
    const staged = await f.create({ signAndProcess: false, returnTXIDOnly: createOption });
    expect(staged.signableTransaction?.tx.length).toBeGreaterThan(0);
    const result = await f.sign(
      staged.signableTransaction!.reference,
      signOption === undefined ? undefined : { returnTXIDOnly: signOption },
    );
    expect(f.signed[0].options?.returnTXIDOnly).toBe(false);
    if (expected) onlyTxid(result);
    else expect(result.tx).toBeDefined();
  });
  test.each(['create', 'sign'] as const)(
    '%s cannot hide a substituted signed output behind returnTXIDOnly',
    async (path) => {
      const f = await fixture();
      f.setFinalMutation((tx) => {
        tx.outputs[0].satoshis = 12;
      });
      if (path === 'create') await expect(f.create({ returnTXIDOnly: true })).rejects.toThrow('substituted');
      else {
        const staged = await f.create({ signAndProcess: false });
        await expect(f.sign(staged.signableTransaction!.reference, { returnTXIDOnly: true })).rejects.toThrow(
          'substituted',
        );
      }
      expect(f.aborted).toHaveLength(1);
      expect(f.reserved()).toBe(false);
    },
  );
  test('a missing full signed body rejects even when the caller only wants a txid', async () => {
    const f = await fixture();
    f.omitFullTx();
    await expect(f.create({ returnTXIDOnly: true })).rejects.toThrow('omitted transaction data');
    expect(f.aborted).toHaveLength(1);
  });
  test('a cross-origin sign cannot alter or consume the original option binding', async () => {
    const f = await fixture();
    const staged = await f.create({ signAndProcess: false, returnTXIDOnly: true });
    const reference = staged.signableTransaction!.reference;
    await expect(f.sign(reference, { returnTXIDOnly: false }, 'attacker.test')).rejects.toThrow('different originator');
    expect(f.signed).toHaveLength(0);
    expect(f.aborted).toHaveLength(0);
    onlyTxid(await f.sign(reference));
  });
  test('aborting clears option state and frees the input for a new independent action', async () => {
    const f = await fixture();
    const staged = await f.create({ signAndProcess: false, returnTXIDOnly: true });
    const reference = staged.signableTransaction!.reference;
    await f.manager.abortAction({ reference }, originator);
    expect(f.reserved()).toBe(false);
    await expect(f.sign(reference)).rejects.toThrow('not issued');
    const next = await f.create({ returnTXIDOnly: false });
    expect(next.tx).toBeDefined();
    expect(f.signed).toHaveLength(1);
  });
  test('invalid sign cleanup remains fail-closed; successful cleanup permits safe input reuse', async () => {
    const f = await fixture();
    const staged = await f.create({ signAndProcess: false, returnTXIDOnly: true });
    const reference = staged.signableTransaction!.reference;
    await expect(
      f.manager.signAction({ reference, spends: { 999: { unlockingScript: '51' } } }, originator),
    ).rejects.toThrow('invalid input');
    expect(f.aborted).toEqual([reference]);
    expect(f.reserved()).toBe(false);
    await expect(f.sign(reference)).rejects.toThrow('not issued');
    expect((await f.create()).tx).toBeDefined();
  });
  test('an abort failure keeps the reference blocked and the input reserved', async () => {
    const f = await fixture();
    const staged = await f.create({ signAndProcess: false });
    const reference = staged.signableTransaction!.reference;
    f.failAbort();
    await expect(
      f.manager.signAction({ reference, spends: { 999: { unlockingScript: '51' } } }, originator),
    ).rejects.toMatchObject({
      message: 'Fixture invalid input spend',
      cleanupFailure: {
        operation: 'abortAction',
        status: 'unconfirmed',
        reference,
        message: 'Fixture abort unavailable',
      },
    });
    expect(f.reserved()).toBe(true);
    await expect(f.sign(reference)).rejects.toThrow('blocked');
    expect(f.signed).toHaveLength(1);
  });
  test('raw invalid returnTXIDOnly is not masked by the internal full-body override', async () => {
    const f = await fixture();
    const staged = await f.create({ signAndProcess: false });
    await expect(
      f.sign(staged.signableTransaction!.reference, { returnTXIDOnly: 'true' as unknown as boolean }),
    ).rejects.toThrow();
    expect(f.signed).toHaveLength(0);
    expect(f.aborted).toHaveLength(1);
  });
  test('BRC177 protected actions cannot hide required proof bytes through a sign-time override', async () => {
    const f = await fixture();
    const staged = await f.create({ signAndProcess: false, noSend: true }, originator, ['p nosend expiry seconds 60']);
    await expect(f.sign(staged.signableTransaction!.reference, { returnTXIDOnly: true })).rejects.toThrow(
      'BRC-177 protected',
    );
    expect(f.signed).toHaveLength(0);
    expect(f.aborted).toHaveLength(1);
  });
  test('the CommonJS manager uses the same staged finalization and public projection', async () => {
    const f = await fixture({ commonjs: true });
    onlyTxid(await f.create({ signAndProcess: true, returnTXIDOnly: true }));
    expect(f.created[0].options?.signAndProcess).toBe(false);
    expect(f.signed[0].options?.returnTXIDOnly).toBe(false);
  });
});

for (const ext of ['mjs', 'cjs', 'd.mts', 'd.cts']) {
  test(`transaction option patch mappings retain exact edited source: ${ext}`, async () => {
    const { readFileSync } = await import('node:fs');
    const { SourceMapConsumer } = await import('source-map');
    const path = `node_modules/@bsv/wallet-toolbox-client/out/index.client.${ext}`;
    const text = readFileSync(path, 'utf8'),
      lines = text.split('\n');
    const map = /sourceMappingURL=([^\r\n]+)/.exec(text)![1];
    const consumer = await new SourceMapConsumer(
      JSON.parse(readFileSync(`node_modules/@bsv/wallet-toolbox-client/out/${map}`, 'utf8')),
    );
    try {
      for (const needle of ext.startsWith('d.')
        ? ['pendingActionReturnOptions', 'projectActionResult', 'preserveActionFailure']
        : [
            'pendingActionReturnOptions =',
            'if (modifiedOptions.signAndProcess !== true ||',
            'return this.projectActionResult',
            'priorReturnOptions?.protected',
            'async preserveActionFailure(reference, error)',
          ]) {
        const line = lines.findIndex((value) => value.includes(needle)) + 1;
        expect(line).toBeGreaterThan(0);
        const mapped = consumer.originalPositionFor({ line, column: lines[line - 1].indexOf(needle) });
        expect(mapped.source).toContain(
          needle.includes('preserveActionFailure') ? 'transaction-cleanup-patch/' : 'transaction-options-patch/',
        );
        expect(consumer.sourceContentFor(mapped.source!)!.split('\n')[mapped.line! - 1]).toContain(needle);
      }
    } finally {
      consumer.destroy();
    }
  });
}

for (const errorKind of ['SDK', 'toolbox'] as const) {
  for (const operation of ['createAction', 'signAction'] as const) {
    for (const cleanupMode of ['throw', 'unconfirmed'] as const) {
      test(`${errorKind} ${operation} keeps primary network rejection and secondary ${cleanupMode} cleanup through the real CWI message path`, async () => {
        const f = await fixture();
        const ErrorClass = errorKind === 'SDK' ? WERR_REVIEW_ACTIONS : toolboxSdk.WERR_REVIEW_ACTIONS;
        const primary = new ErrorClass(
          [{ txid: 'ab'.repeat(32), status: 'failed' }],
          [{ txid: 'ab'.repeat(32), status: 'failed' }],
          'ab'.repeat(32),
          [1, 2, 255],
          ['ab'.repeat(32) + '.0'],
        );
        Object.freeze(primary);
        let reference: string | undefined;
        if (operation === 'signAction')
          reference = (await f.create({ signAndProcess: false })).signableTransaction!.reference;
        f.failSign(primary);
        f.failAbort(cleanupMode);
        const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
        const target = new EventTarget();
        const runtime = {
          lastError: undefined as { message?: string } | undefined,
          sendMessage(message: unknown, reply: (value: unknown) => void) {
            const request = json(message) as any;
            Promise.resolve().then(async () => {
              try {
                validateCwiRequest(request.action, request.params);
                const result = await (f.manager as any)[request.action](request.params, request.originator);
                reply(json({ type: request.action, success: true, data: result }));
              } catch (error) {
                reply(json({ type: request.action, success: false, ...cwiFailure(error) }));
              }
            });
          },
        };
        const close = installCwiContentBridge(target, () => originator, runtime);
        const wallet = createStructuredEventCWI(target);
        try {
          let received: any;
          try {
            if (operation === 'createAction')
              await wallet.createAction({
                description: 'Transport failure regression',
                outputs: [{ satoshis: 11, lockingScript: '51', outputDescription: 'Test recipient' }],
                options: { signAndProcess: true, returnTXIDOnly: true },
              });
            else await wallet.signAction({ reference: reference!, spends: {}, options: { returnTXIDOnly: true } });
          } catch (error) {
            received = error;
          }
          expect(received).toBeInstanceOf(Error);
          expect(received.name).toBe('WERR_REVIEW_ACTIONS');
          expect(received.code).toBe('WERR_REVIEW_ACTIONS');
          expect(received.message).toBe(primary.message);
          for (const key of ['reviewActionResults', 'sendWithResults', 'txid', 'tx', 'noSendChange'] as const)
            expect(received[key]).toEqual(primary[key]);
          expect(received.cleanupFailure).toEqual({
            operation: 'abortAction',
            status: 'unconfirmed',
            reference: f.signed[0].reference,
            message:
              cleanupMode === 'throw'
                ? 'Fixture abort unavailable'
                : 'Failed action cleanup did not confirm aborted:true.',
          });
          expect(f.reserved()).toBe(true);
          expect(f.pending.size).toBe(1);
          await expect(f.sign(f.signed[0].reference)).rejects.toThrow('blocked');
          expect(f.signed).toHaveLength(1);
        } finally {
          close();
        }
      });
    }
  }
}
