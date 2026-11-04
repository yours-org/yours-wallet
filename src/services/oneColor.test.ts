import { describe, expect, test } from 'bun:test';
import { OneColor } from '@1sat/templates';
import { aggregateOneColorHoldings, assetInfoFromMetadata, normalizeHandle, oneColorActionAmount } from './oneColor';

const ASSET = `${'ab'.repeat(32)}_0`;
const OTHER = `${'cd'.repeat(32)}_0`;
const pkh = new Array(20).fill(7);
const value = (assetId: string, amount: bigint) => OneColor.value(assetId, amount, { lock: pkh }).lock().toHex();
const authority = (assetId: string) => OneColor.authority(assetId, { lock: pkh }).lock().toHex();

describe('aggregateOneColorHoldings', () => {
  test('sums value by asset, splitting reserved from available, and counts authorities', () => {
    const held = aggregateOneColorHoldings([
      { lockingScript: value(ASSET, 100n), tags: ['p color', 'color_state_available'] },
      { lockingScript: value(ASSET, 25n), tags: ['p color', 'color_state_reserved'] },
      { lockingScript: value(ASSET, 5n), tags: ['color_state_available'] },
      { lockingScript: authority(ASSET), tags: ['color_state_available'] },
      { lockingScript: value(OTHER, 1n), tags: ['color_state_available'] },
    ]);
    expect(held.get(ASSET)).toEqual({ assetId: ASSET, available: 105n, reserved: 25n, authorities: 1 });
    expect(held.get(OTHER)).toEqual({ assetId: OTHER, available: 1n, reserved: 0n, authorities: 0 });
  });

  test('skips outputs that are not 1Color value or authority outputs', () => {
    const deploy = OneColor.deployValue(10n, { lock: pkh }).lock().toHex();
    const held = aggregateOneColorHoldings([
      { lockingScript: deploy, tags: [] },
      { lockingScript: '76a914' + '00'.repeat(20) + '88ac', tags: [] },
      { lockingScript: 'zz', tags: [] },
      { tags: [] },
    ]);
    expect(held.size).toBe(0);
  });
});

describe('assetInfoFromMetadata', () => {
  test('no metadata: zero decimals, nothing else', () => {
    expect(assetInfoFromMetadata(undefined)).toEqual({ dec: 0 });
  });

  test('symbol, decimals and an image icon as a data URL', () => {
    const info = assetInfoFromMetadata({
      sym: 'TKN',
      dec: 2,
      icon: { mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
    });
    expect(info).toEqual({ sym: 'TKN', dec: 2, icon: 'data:image/png;base64,AQID' });
  });

  test('a non-image icon is left out', () => {
    const info = assetInfoFromMetadata({ icon: { mediaType: 'text/plain', bytes: new Uint8Array([1]) } });
    expect(info).toEqual({ dec: 0 });
  });
});

describe('normalizeHandle', () => {
  test('accepts with or without the leading @ and trims', () => {
    expect(normalizeHandle('alice@testnet.1sat.app')).toBe('@alice@testnet.1sat.app');
    expect(normalizeHandle('  @alice@testnet.1sat.app ')).toBe('@alice@testnet.1sat.app');
  });
  test('rejects addresses and malformed input', () => {
    expect(normalizeHandle('1BoatSLRHtKNngkdXEeobR76b53LETtpyT')).toBeNull();
    expect(normalizeHandle('@alice')).toBeNull();
    expect(normalizeHandle('@a@b@c')).toBeNull();
    expect(normalizeHandle('')).toBeNull();
  });
});

describe('oneColorActionAmount', () => {
  const TXID = 'ef'.repeat(32);
  const base = {
    txid: TXID,
    satoshis: 0,
    status: 'completed' as const,
    isOutgoing: true,
    description: '',
    version: 1,
    lockTime: 0,
  };
  const out = (lockingScript: string, outputIndex: number, basket?: string) => ({
    lockingScript,
    outputIndex,
    satoshis: 1,
    spendable: true,
    tags: [],
    outputDescription: '',
    basket,
  });
  const inp = (sourceLockingScript: string) => ({
    sourceOutpoint: `${TXID}.0`,
    sourceSatoshis: 1,
    sourceLockingScript,
    inputDescription: '',
    sequenceNumber: 0,
  });

  test('a send: the value output that is not ours is the amount', () => {
    const r = oneColorActionAmount(
      {
        ...base,
        inputs: [inp(value(ASSET, 100n))],
        outputs: [out(value(ASSET, 60n), 0), out(value(ASSET, 40n), 1, 'p color abc')],
      },
      ASSET,
    );
    expect(r).toEqual({ direction: 'sent', amount: 60n });
  });

  test('a receive: value filed into our p color basket, no inputs', () => {
    const r = oneColorActionAmount(
      { ...base, isOutgoing: false, outputs: [out(value(ASSET, 7n), 0, 'p color abc')] },
      ASSET,
    );
    expect(r).toEqual({ direction: 'received', amount: 7n });
  });

  test('a deploy at this action counts as the asset arriving', () => {
    const deploy = OneColor.deployValue(1000n, { lock: pkh }).lock().toHex();
    const r = oneColorActionAmount({ ...base, outputs: [out(deploy, 0, 'p color abc')] }, `${TXID}_0`);
    expect(r).toEqual({ direction: 'received', amount: 1000n });
  });

  test('another asset, or no token outputs at all: null', () => {
    expect(oneColorActionAmount({ ...base, outputs: [out(value(OTHER, 1n), 0)] }, ASSET)).toBeNull();
    expect(oneColorActionAmount({ ...base, outputs: [out('76a914' + '00'.repeat(20) + '88ac', 0)] }, ASSET)).toBeNull();
  });

  test('inputs and outputs that net to nothing we can name: a transfer', () => {
    const r = oneColorActionAmount(
      { ...base, inputs: [inp(value(ASSET, 10n))], outputs: [out(value(ASSET, 10n), 0, 'p color abc')] },
      ASSET,
    );
    expect(r).toEqual({ direction: 'transfer', amount: 0n });
  });
});
