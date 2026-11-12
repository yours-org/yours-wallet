import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { InMemoryPermissionStore, LocalWalletPermissionsManager } from '@1sat/wallet';
import { WalletPermissionsManager } from '@bsv/wallet-toolbox-client';
import { PrivateKey, ProtoWallet, PushDrop, Transaction } from '@bsv/sdk';
import { validateListOutputsArgs } from '@bsv/sdk/wallet/validationHelpers';
import type { ListOutputsArgs, WalletInterface } from '@bsv/sdk';

const originator = 'basket-boundary.test';
const admin = 'yours-wallet';
const expectedTag = (basket: string) =>
  Buffer.byteLength(`basket ${basket}`) <= 300
    ? `basket ${basket}`
    : `basket-sha256 ${createHash('sha256').update(basket).digest('hex')}`;

for (const basket of [
  'a'.repeat(293),
  'a'.repeat(294),
  'a'.repeat(299),
  'a'.repeat(300),
  'é'.repeat(147),
  'é'.repeat(150),
]) {
  test(`valid ${Buffer.byteLength(basket)}-byte basket reaches permission grant and survives restart`, async () => {
    const store = new InMemoryPermissionStore();
    const requests: ListOutputsArgs[] = [];
    const underlying = Object.assign(new ProtoWallet(new PrivateKey(1)), {
      async listOutputs(args: ListOutputsArgs) {
        validateListOutputsArgs(args); // The same SDK validation that rejected oversized prefixed tags.
        requests.push(structuredClone(args));
        return { totalOutputs: 0, outputs: [] };
      },
    });
    const makeManager = () =>
      new LocalWalletPermissionsManager(
        underlying as unknown as WalletInterface,
        admin,
        { seekGroupedPermission: false },
        { store },
      );
    const manager = makeManager();
    let prompts = 0;
    manager.bindCallback('onBasketAccessRequested', async (event: any) => {
      expect(event.basket).toBe(basket);
      prompts++;
      await manager.grantPermission({ requestID: event.requestID, expiry: 0 });
    });
    await expect(manager.ensureBasketAccess({ originator, basket, usageType: 'listing' })).resolves.toBe(true);
    expect(prompts).toBe(1);
    expect(requests[0].tags).toContain(expectedTag(basket));
    expect(requests.flatMap((request) => request.tags ?? []).every((tag) => Buffer.byteLength(tag) <= 300)).toBe(true);
    const before = requests.length;
    await expect(
      makeManager().ensureBasketAccess({ originator, basket, usageType: 'listing', seekPermission: false }),
    ).resolves.toBe(true);
    expect(requests).toHaveLength(before);
    expect((await store.listGrants())[0].key).toEqual({ type: 'basket', originator, basket });
  });
}

test('on-chain permission writer and both readers agree on bounded tags and authenticate the full basket name', async () => {
  const basket = 'a'.repeat(300);
  const lookalike = 'a'.repeat(299) + 'b';
  const proto = new ProtoWallet(new PrivateKey(2));
  const rows: any[] = [];
  const queries: ListOutputsArgs[] = [];
  const underlying = Object.assign(proto, {
    async listOutputs(args: ListOutputsArgs) {
      validateListOutputsArgs(args);
      queries.push(structuredClone(args));
      return { totalOutputs: rows.length, outputs: rows.map((row) => row.output), BEEF: rows[0].tx.toBEEF() };
    },
  });
  const manager = new WalletPermissionsManager(underlying as unknown as WalletInterface, admin);
  const internals = manager as any;
  // Build actual encrypted and signed PushDrop tokens. No decryption or token-authentication methods are stubbed.
  for (const name of [lookalike, basket]) {
    const request = { type: 'basket', originator, basket: name };
    const fields = await internals.buildPushdropFields(request, 0);
    const script = await new PushDrop(proto).lock(
      fields,
      WalletPermissionsManager.PERM_TOKEN_ENCRYPTION_PROTOCOL,
      '1',
      'self',
      true,
      true,
    );
    const tx = new Transaction(1, [], [{ satoshis: 1, lockingScript: script }], 0);
    rows.push({
      tx,
      output: { outpoint: `${tx.id('hex')}.0`, satoshis: 1, tags: internals.buildTagsForRequest(request) },
    });
  }
  // Supply a combined BEEF and both rows even for an exact tag filter, simulating an erroneous index hit.
  const { Beef } = await import('@bsv/sdk');
  const beef = new Beef();
  for (const row of rows) beef.mergeBeef(row.tx.toBEEF());
  underlying.listOutputs = async (args) => {
    validateListOutputsArgs(args);
    queries.push(structuredClone(args));
    return { totalOutputs: rows.length, outputs: rows.map((row) => row.output), BEEF: beef.toBinary() };
  };
  expect(rows[0].output.tags).toContain(expectedTag(lookalike));
  expect(rows[1].output.tags).toContain(expectedTag(basket));
  expect(expectedTag(lookalike)).not.toBe(expectedTag(basket));
  const token = await internals.findBasketToken(originator, basket, false);
  expect(token?.basketName).toBe(basket);
  expect(token?.txid).toBe(rows[1].tx.id('hex'));
  const listed = await manager.listBasketAccess({ originator, basket });
  expect(listed.map((entry) => entry.basketName)).toEqual([basket]);
  expect(queries.every((query) => query.tags?.includes(expectedTag(basket)))).toBe(true);
});

test('short-tag compatibility and a disjoint hash prefix are preserved in both exports', () => {
  const require = createRequire(import.meta.url);
  const CjsManager = require('@bsv/wallet-toolbox-client').WalletPermissionsManager;
  for (const Manager of [WalletPermissionsManager, CjsManager]) {
    const manager = new Manager(new ProtoWallet(new PrivateKey(3)) as unknown as WalletInterface, admin) as any;
    const short = 'a'.repeat(293);
    const long = 'a'.repeat(294);
    expect(manager.buildTagsForRequest({ type: 'basket', originator, basket: short })).toContain(`basket ${short}`);
    expect(manager.buildTagsForRequest({ type: 'basket', originator, basket: long })).toContain(expectedTag(long));
    const digestName = expectedTag(long).slice('basket-sha256 '.length);
    expect(manager.basketPermissionTag(`sha256 ${digestName}`)).not.toBe(expectedTag(long));
  }
});
