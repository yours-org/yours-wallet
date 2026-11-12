import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { InMemoryPermissionStore, LocalWalletPermissionsManager } from '@1sat/wallet';
import { makeBrc153ReferenceLabel, WalletPermissionsManager } from '@bsv/wallet-toolbox-client';
import { LockingScript, Transaction, UnlockingScript } from '@bsv/sdk';
import type { CreateActionArgs, ListActionsArgs, WalletAction, WalletInterface } from '@bsv/sdk';

const originator = 'allowance.itcve.test';
const admin = 'yours-wallet';
const reference = (value: number) => Buffer.from(`action-${value}`).toString('base64');
const currentMonth = () => new Date().toISOString().slice(0, 7);
const accountingLabels = () => [`admin originator ${originator}`, `admin month ${currentMonth()}`];
const action = (satoshis: number, ref: string, status = 'unsigned'): WalletAction => ({
  txid: 'ab'.repeat(32),
  satoshis,
  status: status as WalletAction['status'],
  isOutgoing: satoshis < 0,
  description: 'Allowance accounting fixture',
  version: 1,
  lockTime: 0,
  labels: [...accountingLabels(), makeBrc153ReferenceLabel(ref)],
});

// Real exported managers, real permission store and real BEEF transaction parsing.
// Only the underlying wallet/storage boundary is a deterministic in-memory fixture.
async function fixture(
  options: { history?: WalletAction[]; pageSize?: number; labels?: (labels: string[]) => string[] } = {},
) {
  const store = new InMemoryPermissionStore();
  await store.putGrant({
    key: { type: 'spending', originator },
    expiry: 0,
    grantedAt: Date.now(),
    authorizedAmount: 100,
  });
  const history = [...(options.history ?? [])];
  const requests: ListActionsArgs[] = [];
  const pending = new Map<string, { tx: Transaction; row: WalletAction }>();
  const prompts: unknown[] = [];
  const aborted: string[] = [];
  const signed: string[] = [];
  let next = 100;
  let afterCreate: (() => Promise<void>) | undefined;
  const underlying = {
    async createAction(args: CreateActionArgs) {
      const ref = reference(next++);
      const output = args.outputs![0];
      const spend = output.satoshis + 23;
      const source = new Transaction(1, [], [{ satoshis: 1000, lockingScript: LockingScript.fromHex('51') }], 0);
      const tx = new Transaction(
        1,
        [
          {
            sourceTransaction: source,
            sourceOutputIndex: 0,
            unlockingScript: UnlockingScript.fromHex('51'),
            sequence: 0xffffffff,
          },
        ],
        [
          { satoshis: output.satoshis, lockingScript: LockingScript.fromHex(output.lockingScript) },
          { satoshis: 1000 - spend, lockingScript: LockingScript.fromHex('51') },
        ],
        0,
      );
      const row = action(-spend, ref);
      row.labels = options.labels?.([...args.labels!, makeBrc153ReferenceLabel(ref)]) ?? [
        ...args.labels!,
        makeBrc153ReferenceLabel(ref),
      ];
      history.push(row);
      pending.set(ref, { tx, row });
      await afterCreate?.();
      return { signableTransaction: { reference: ref, tx: tx.toAtomicBEEF() } };
    },
    async listActions(args: ListActionsArgs, caller: string) {
      expect(caller).toBe(admin);
      requests.push(structuredClone(args));
      const matching = history.filter((entry) => args.labels.every((label) => entry.labels?.includes(label)));
      const offset = args.offset ?? 0;
      return {
        totalActions: matching.length,
        actions: matching
          .slice(offset, offset + Math.min(args.limit ?? 10000, options.pageSize ?? 10000))
          .map((entry) => {
            const copy = structuredClone(entry);
            if (!args.includeLabels) delete copy.labels;
            return copy;
          }),
      };
    },
    async signAction(args: { reference: string; options?: { noSend?: boolean } }) {
      const value = pending.get(args.reference)!;
      signed.push(args.reference);
      value.row.status = args.options?.noSend ? 'nosend' : 'completed';
      return { txid: value.tx.id('hex'), tx: value.tx.toAtomicBEEF() };
    },
    async abortAction(args: { reference: string }) {
      aborted.push(args.reference);
      const value = pending.get(args.reference)!;
      history.splice(history.indexOf(value.row), 1);
      return { aborted: true };
    },
    async listOutputs() {
      return { totalOutputs: 0, outputs: [] };
    },
  };
  function manager() {
    const instance = new LocalWalletPermissionsManager(
      underlying as unknown as WalletInterface,
      admin,
      { encryptWalletMetadata: false, seekGroupedPermission: false },
      { store },
    );
    instance.bindCallback('onSpendingAuthorizationRequested', async (event: any) => {
      prompts.push(event);
      await instance.denyPermission(event.requestID);
    });
    return instance;
  }
  const pay = (instance: LocalWalletPermissionsManager, outputSatoshis: number, noSend = false) =>
    instance.createAction(
      {
        description: 'Standing allowance regression payment',
        outputs: [{ lockingScript: '51', satoshis: outputSatoshis, outputDescription: 'Test output' }],
        options: { noSend },
      },
      originator,
    );
  return {
    store,
    history,
    requests,
    underlying,
    prompts,
    aborted,
    signed,
    manager,
    pay,
    setAfterCreate: (fn: () => Promise<void>) => (afterCreate = fn),
  };
}

describe('standing monthly spending allowance', () => {
  test('the current unsigned 54-satoshi debit is charged once and finalized', async () => {
    const f = await fixture();
    await f.pay(f.manager(), 31);
    expect(f.prompts).toHaveLength(0);
    expect(f.signed).toHaveLength(1);
    expect(f.history.map((entry) => entry.satoshis)).toEqual([-54]);
    expect(f.requests.every((request) => request.includeLabels === true)).toBe(true);
  });

  test('sequential fee-inclusive payments total 70 across manager restart and noSend reservations', async () => {
    const f = await fixture();
    await f.pay(f.manager(), 11, true);
    await f.pay(f.manager(), 13);
    expect(f.prompts).toHaveLength(0);
    expect(f.signed).toHaveLength(2);
    const token = (await f.manager().listSpendingAuthorizations({ originator }))[0];
    expect(await f.manager().querySpentSince(token)).toBe(70);
    expect((await f.store.findGrant({ type: 'spending', originator }))?.authorizedAmount).toBe(100);
  });

  test.each(['unsigned', 'nosend', 'nonfinal', 'unprocessed', 'sending', 'unproven', 'completed'])(
    'another %s reservation remains in the budget and overflow prompts then aborts',
    async (status) => {
      const f = await fixture({ history: [action(-80, reference(1), status)] });
      await expect(f.pay(f.manager(), 7)).rejects.toThrow();
      expect(f.prompts).toHaveLength(1);
      expect(f.aborted).toHaveLength(1);
      expect(f.signed).toHaveLength(0);
      expect(f.history.map((entry) => entry.satoshis)).toEqual([-80]);
    },
  );

  test('serializes overlapping creations so one affordable action can use the allowance', async () => {
    const f = await fixture();
    let release!: () => void;
    let entered!: () => void;
    const barrier = new Promise<void>((resolve) => (release = resolve));
    const firstCreated = new Promise<void>((resolve) => (entered = resolve));
    let arrivals = 0;
    f.setAfterCreate(async () => {
      if (++arrivals === 1) {
        entered();
        await barrier;
      }
    });
    const manager = f.manager();
    const first = f.pay(manager, 47);
    await firstCreated;
    const second = f.pay(manager, 17);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(arrivals).toBe(1);
    release();
    const results = await Promise.allSettled([first, second]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(f.signed).toHaveLength(1);
    expect(f.aborted).toHaveLength(1);
    expect(f.prompts).toHaveLength(1);
    expect(f.history.map((entry) => entry.satoshis)).toEqual([-70]);
  });

  test('overlapping affordable actions still use the exact fee-inclusive cap', async () => {
    const f = await fixture();
    const manager = f.manager();
    await Promise.all([f.pay(manager, 11), f.pay(manager, 43)]);
    expect(f.signed).toHaveLength(2);
    expect(f.prompts).toHaveLength(0);
    expect(f.aborted).toHaveLength(0);
    expect(f.history.reduce((sum, entry) => sum - entry.satoshis, 0)).toBe(100);
  });

  test('a failed creation releases its origin queue for the next request', async () => {
    const f = await fixture();
    const manager = f.manager();
    const results = await Promise.allSettled([f.pay(manager, -1), f.pay(manager, 11)]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
    expect(f.signed).toHaveLength(1);
    expect(f.history.map((entry) => entry.satoshis)).toEqual([-34]);
  });

  test.each([
    ['missing reference', (labels: string[]) => labels.filter((label) => !label.startsWith('reference ')), 'missing'],
    [
      'another reference',
      (labels: string[]) => [
        ...labels.filter((label) => !label.startsWith('reference ')),
        makeBrc153ReferenceLabel(reference(999)),
      ],
      'missing',
    ],
    [
      'ambiguous reference labels',
      (labels: string[]) => [...labels, makeBrc153ReferenceLabel(reference(999))],
      'ambiguous',
    ],
  ] as const)('%s fails closed and aborts the new action', async (_name, labels, reason) => {
    const f = await fixture({ labels });
    await expect(f.pay(f.manager(), 11)).rejects.toThrow(reason);
    expect(f.signed).toHaveLength(0);
    expect(f.aborted).toHaveLength(1);
    expect(f.prompts).toHaveLength(0);
  });

  test('duplicate matching actions across pages fail closed', async () => {
    const f = await fixture({ history: [action(-1, reference(100))], pageSize: 1 });
    await expect(f.pay(f.manager(), 11)).rejects.toThrow('ambiguous');
    expect(f.requests.map((request) => request.offset)).toEqual([0, 1]);
    expect(f.signed).toHaveLength(0);
  });

  test('pagination and signed incoming values preserve existing net accounting', async () => {
    const f = await fixture({
      history: [action(-60, reference(1)), action(10, reference(2)), action(-15, reference(3))],
      pageSize: 1,
    });
    await f.pay(f.manager(), 12); // 65 prior + 35 current exactly reaches 100.
    expect(f.prompts).toHaveLength(0);
    expect(f.requests.map((request) => request.offset)).toEqual([0, 1, 2, 3]);
    const token = (await f.manager().listSpendingAuthorizations({ originator }))[0];
    expect(await f.manager().querySpentSince(token)).toBe(100);
  });

  test('pre-creation authorization and settings history do not omit any action', async () => {
    const f = await fixture({ history: [action(-70, reference(1))] });
    const manager = f.manager();
    await expect(
      manager.ensureSpendingAuthorization({ originator, satoshis: 30, seekPermission: false }),
    ).resolves.toBe(true);
    await expect(
      manager.ensureSpendingAuthorization({ originator, satoshis: 31, seekPermission: false }),
    ).rejects.toThrow('insufficient');
    expect(f.requests.every((request) => request.includeLabels === undefined)).toBe(true);
  });

  test('the CommonJS export enforces the same reference exclusion and fail-closed contract', async () => {
    const require = createRequire(import.meta.url);
    const CjsManager = require('@bsv/wallet-toolbox-client')
      .WalletPermissionsManager as typeof WalletPermissionsManager;
    const f = await fixture({ history: [action(-34, reference(1)), action(-36, reference(2))] });
    const manager = new CjsManager(f.underlying as unknown as WalletInterface, admin);
    const token = (await f.manager().listSpendingAuthorizations({ originator }))[0];
    expect(await manager.querySpentSince(token, reference(2))).toBe(34);
    await expect(manager.querySpentSince(token, reference(99))).rejects.toThrow('missing');
  });
});
