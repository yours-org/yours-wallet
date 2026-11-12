import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { Wallet } from '@bsv/wallet-toolbox-client';
import { Beef, KeyDeriver, LockingScript, PrivateKey, Transaction } from '@bsv/sdk';

type Mode =
  | 'storage-beef'
  | 'storage-raw'
  | 'retained'
  | 'missing'
  | 'wrong-raw'
  | 'wrong-outpoint'
  | 'wrong-amount'
  | 'wrong-script'
  | 'abort-failure';
function fixture(mode: Mode, Manager = Wallet) {
  const keyDeriver = new KeyDeriver(new PrivateKey(21));
  const source = new Transaction(1, [], [{ satoshis: 100, lockingScript: LockingScript.fromHex('7551') }], 0);
  const sourceId = source.id('hex');
  const known = new Beef();
  known.mergeTxidOnly(sourceId);
  const full = new Beef();
  full.mergeTransaction(source);
  let reserved = false;
  const calls = { create: 0, abort: 0, process: 0 };
  const storage = {
    _authId: { identityKey: keyDeriver.identityKey },
    getSettings: () => ({ storageIdentityKey: keyDeriver.identityKey, storageName: 'Fixture' }),
    async createAction(args: any) {
      calls.create++;
      // The fixture models storage's existing trustSelf:'known' check before reservation.
      if (args.options.trustSelf !== 'known' || args.inputs[0].outpoint.txid !== sourceId)
        throw new Error('Unknown input transaction');
      reserved = true;
      return {
        reference: Buffer.from('known-input-fixture').toString('base64'),
        derivationPrefix: Buffer.from('prefix').toString('base64'),
        inputBeef: mode === 'storage-beef' ? full.toBinary() : known.toBinary(),
        inputs: [
          {
            vin: 0,
            sourceTxid: mode === 'wrong-outpoint' ? 'ab'.repeat(32) : sourceId,
            sourceVout: 0,
            sourceSatoshis: mode === 'wrong-amount' ? 101 : 100,
            sourceLockingScript: mode === 'wrong-script' ? '51' : '7551',
            sourceTransaction:
              mode === 'missing' || mode === 'storage-beef' || mode === 'retained' || mode === 'abort-failure'
                ? undefined
                : mode === 'wrong-raw'
                  ? new Transaction(
                      1,
                      [],
                      [{ satoshis: 101, lockingScript: LockingScript.fromHex('7551') }],
                      0,
                    ).toBinary()
                  : source.toBinary(),
          },
        ],
        outputs: [{ vout: 0, providedBy: 'you', purpose: '', satoshis: 90, lockingScript: '51' }],
      };
    },
    async abortAction() {
      calls.abort++;
      if (mode === 'abort-failure') throw new Error('Fixture abort unavailable');
      reserved = false;
      return { aborted: true };
    },
    async processAction() {
      calls.process++;
      reserved = false;
      return {};
    },
  };
  const wallet = new Manager({ chain: 'test', keyDeriver, storage: storage as any, actionBatchMode: 'legacy' });
  if (mode === 'retained') wallet.beef.mergeBeef(full);
  const args = () => ({
    description: 'Hydrate a known caller input',
    inputBEEF: known.toBinary(),
    inputs: [
      { outpoint: `${sourceId}.0`, unlockingScriptLength: 1, inputDescription: 'Previously known source input' },
    ],
    outputs: [{ satoshis: 90, lockingScript: '51', outputDescription: 'Requested recipient output' }],
    options: { noSend: true, trustSelf: 'known' as const, knownTxids: [sourceId], randomizeOutputs: false },
  });
  return { wallet, args, source, sourceId, calls, reserved: () => reserved };
}

for (const mode of ['storage-beef', 'storage-raw', 'retained'] as const) {
  test(`txid-only known input hydrates from ${mode}, signs, and retains knownTxids trimming`, async () => {
    const f = fixture(mode);
    const created = await f.wallet.createAction(f.args());
    expect(created.signableTransaction).toBeDefined();
    const signable = Transaction.fromAtomicBEEF(created.signableTransaction!.tx);
    expect(signable.inputs[0].sourceTransaction?.id('hex')).toBe(f.sourceId);
    expect(signable.inputs[0].sourceTransaction?.outputs[0].satoshis).toBe(100);
    const finalized = await f.wallet.signAction({
      reference: created.signableTransaction!.reference,
      spends: { 0: { unlockingScript: '51' } },
      options: { noSend: true },
    });
    const returned = Beef.fromBinary(finalized.tx!);
    expect(returned.findTxid(f.sourceId)?.isTxidOnly).toBe(true);
    expect(returned.atomicTxid).toBe(finalized.txid!);
    expect(f.calls).toEqual({ create: 1, abort: 0, process: 1 });
    expect(f.reserved()).toBe(false);
  });
}

for (const mode of ['missing', 'wrong-raw', 'wrong-outpoint', 'wrong-amount', 'wrong-script'] as const) {
  test(`${mode} source fails closed and aborts its storage reservation`, async () => {
    const f = fixture(mode);
    await expect(f.wallet.createAction(f.args())).rejects.toThrow();
    expect(f.calls).toEqual({ create: 1, abort: 1, process: 0 });
    expect(f.reserved()).toBe(false);
    expect(Object.keys(f.wallet.pendingSignActions)).toHaveLength(0);
  });
}

test('unknown input rejects before storage reservation and is not invented from a txid', async () => {
  const f = fixture('storage-raw');
  const args = f.args();
  const unknown = new Beef();
  unknown.mergeTxidOnly('ab'.repeat(32));
  args.inputBEEF = unknown.toBinary();
  args.inputs[0].outpoint = `${'ab'.repeat(32)}.0`;
  await expect(f.wallet.createAction(args)).rejects.toThrow('Unknown input transaction');
  expect(f.calls).toEqual({ create: 1, abort: 0, process: 0 });
  expect(f.reserved()).toBe(false);
});

test('abort failure remains an explicit aggregate error and cannot report a released reservation', async () => {
  const f = fixture('abort-failure');
  const failure = await f.wallet.createAction(f.args()).catch((error) => error);
  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure.errors).toHaveLength(2);
  expect(failure.errors[1].message).toBe('Fixture abort unavailable');
  expect(f.reserved()).toBe(true);
});

test('CommonJS Wallet also hydrates a storage-known source', async () => {
  const require = createRequire(import.meta.url);
  const f = fixture('storage-raw', require('@bsv/wallet-toolbox-client').Wallet);
  const created = await f.wallet.createAction(f.args());
  expect(Transaction.fromAtomicBEEF(created.signableTransaction!.tx).inputs[0].sourceTransaction?.id('hex')).toBe(
    f.sourceId,
  );
});
