import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { InMemoryPermissionStore, LocalWalletPermissionsManager } from '@1sat/wallet';
import { WalletPermissionsManager } from '@bsv/wallet-toolbox-client';
import { PrivateKey, ProtoWallet, Utils } from '@bsv/sdk';
import { validateCwiRequest } from './cwi-validation';

const originator = 'linkage-scope.itcve.test';
const root = new ProtoWallet(PrivateKey.fromHex('11'.repeat(32)));
const peer = new ProtoWallet(PrivateKey.fromHex('22'.repeat(32)));
const otherPeer = new ProtoWallet(PrivateKey.fromHex('23'.repeat(32)));
const verifier = new ProtoWallet(PrivateKey.fromHex('33'.repeat(32)));
const otherVerifier = new ProtoWallet(PrivateKey.fromHex('34'.repeat(32)));
const identity = async (wallet: ProtoWallet) => (await wallet.getPublicKey({ identityKey: true })).publicKey;

describe('specific linkage authorization', () => {
  test('a stored grant binds the revealed peer as well as verifier, protocol and level-2 key', async () => {
    const store = new InMemoryPermissionStore();
    const args = {
      counterparty: await identity(peer),
      verifier: await identity(verifier),
      protocolID: [2, 'tpnil sensitive linkage'] as [2, string],
      keyID: 'scoped key',
    };
    // A legacy grant omitted the revealed peer. It must require fresh consent.
    await store.putGrant({
      key: {
        type: 'protocol',
        originator,
        privileged: false,
        protocolLevel: 2,
        protocolName: `specific key linkage revelation ${args.protocolID[1]} ${args.keyID}`,
        counterparty: args.verifier,
      },
      expiry: 0,
      grantedAt: Date.now(),
    });
    const underlying = Object.assign(root, { listOutputs: async () => ({ outputs: [], totalOutputs: 0 }) });
    const manager = new LocalWalletPermissionsManager(
      underlying as any,
      'yours-wallet',
      { encryptWalletMetadata: false },
      { store },
    );
    const prompts: any[] = [];
    let approve = true;
    manager.bindCallback('onProtocolPermissionRequested', async (event) => {
      prompts.push(event);
      if (approve) await manager.grantPermission({ requestID: event.requestID, expiry: 0 });
      else await manager.denyPermission(event.requestID);
    });
    const result = await manager.revealSpecificKeyLinkage(args, originator);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].protocolID[1]).toContain(args.counterparty);
    expect(prompts[0].counterparty).toBe(args.verifier);
    expect(result.counterparty).toBe(args.counterparty);
    expect(result.verifier).toBe(args.verifier);
    // The permission index changes; the public BRC-69 encryption context stays exact.
    const clear = await verifier.decrypt({
      protocolID: [2, `specific linkage revelation ${args.protocolID[0]} ${args.protocolID[1]}`],
      keyID: args.keyID,
      counterparty: await identity(root),
      ciphertext: result.encryptedLinkage,
    });
    expect(clear.plaintext).toEqual(
      peer.keyDeriver!.revealSpecificSecret(await identity(root), args.protocolID, args.keyID),
    );
    await manager.revealSpecificKeyLinkage(args, originator);
    expect(prompts).toHaveLength(1);
    approve = false;
    for (const changed of [
      { ...args, counterparty: await identity(otherPeer) },
      { ...args, verifier: await identity(otherVerifier) },
      { ...args, protocolID: [2, 'tpnil another linkage'] as [2, string] },
      { ...args, keyID: 'another scoped key' },
    ]) {
      await expect(manager.revealSpecificKeyLinkage(changed, originator)).rejects.toThrow('Permission denied');
    }
    expect(prompts).toHaveLength(5);
    await manager.revealSpecificKeyLinkage(args, originator);
    expect(prompts).toHaveLength(5);
  });

  for (const [format, Manager] of [
    ['ESM', WalletPermissionsManager],
    [
      'CJS',
      createRequire(import.meta.url)('@bsv/wallet-toolbox-client')
        .WalletPermissionsManager as typeof WalletPermissionsManager,
    ],
  ] as const) {
    test(`${format} keeps complete long protocol scopes in bounded lookup and mint indexes`, async () => {
      const queries: any[] = [];
      const manager = new Manager(
        {
          listOutputs: async (args: any) => {
            queries.push(args);
            return { outputs: [], totalOutputs: 0 };
          },
        } as any,
        'yours-wallet',
        { encryptWalletMetadata: false },
      );
      const args = {
        counterparty: await identity(peer),
        verifier: await identity(verifier),
        protocolID: [2, 'a'.repeat(400)] as [2, string],
        keyID: 'k'.repeat(800),
      };
      validateCwiRequest('revealSpecificKeyLinkage', args);
      const prompts: any[] = [];
      manager.bindCallback('onProtocolPermissionRequested', async (event) => {
        prompts.push(event);
        await manager.denyPermission(event.requestID);
      });
      await expect(manager.revealSpecificKeyLinkage(args, originator)).rejects.toThrow('Permission denied');
      expect(prompts).toHaveLength(1);
      expect(prompts[0].protocolID[1]).toContain(args.counterparty);
      expect(prompts[0].protocolID[1]).toContain(args.protocolID[1]);
      expect(prompts[0].protocolID[1]).toContain(args.keyID);
      const tags = queries.flatMap((query) => query.tags ?? []);
      expect(tags.some((tag) => tag.startsWith('protocolName-sha256 '))).toBe(true);
      for (const tag of tags) expect(Utils.toArray(tag, 'utf8').length).toBeLessThanOrEqual(300);
      const instance = manager as any;
      const requestTags = instance.buildTagsForRequest(prompts[0]);
      const lookupTags = instance.protocolTokenTags(originator, false, 2, prompts[0].protocolID[1], args.verifier);
      expect(requestTags).toEqual(lookupTags);
      const different = instance.protocolTokenTags(
        originator,
        false,
        2,
        `${prompts[0].protocolID[1]} other`,
        args.verifier,
      );
      expect(different.find((tag: string) => tag.startsWith('protocolName-sha256 '))).not.toBe(
        lookupTags.find((tag: string) => tag.startsWith('protocolName-sha256 ')),
      );
    });
  }
});
