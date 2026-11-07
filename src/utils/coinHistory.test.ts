import { describe, expect, test } from 'bun:test';
import { bsvRowOf, directionFromAction, historyKindOf } from './coinHistory';

describe('directionFromAction', () => {
  test('follows the sign of the net satoshis, not who built the transaction', () => {
    // An AMM swap staged: sats left the spendable pool into a staging basket.
    expect(directionFromAction({ satoshis: -1_247_909 })).toBe('sent');
    // The swap undone: the wallet built this too, and the sats came back.
    expect(directionFromAction({ satoshis: 1_247_746 })).toBe('received');
    // Incoming payment.
    expect(directionFromAction({ satoshis: 5_012 })).toBe('received');
    // A token move that only paid a fee reads as sent; nothing moved reads as transfer.
    expect(directionFromAction({ satoshis: -163 })).toBe('sent');
    expect(directionFromAction({ satoshis: 0 })).toBe('transfer');
  });
});

describe('bsvRowOf', () => {
  const base = {
    txid: 'ab'.repeat(32),
    status: 'completed' as const,
    description: '',
    version: 1,
    lockTime: 0,
  };
  const out = (satoshis: number, basket?: string) => ({
    satoshis,
    outputIndex: 0,
    spendable: true,
    tags: [],
    outputDescription: '',
    basket,
  });

  test('a synced receive with a zero net is summed from its spendable outputs', () => {
    const row = bsvRowOf({ ...base, satoshis: 0, isOutgoing: false, outputs: [out(5_582_773, 'default')] });
    expect(row?.direction).toBe('received');
    expect(row?.amountDisplay).toBe('+0.05582773 BSV');
  });

  test('an action that moved no sats of ours is left out', () => {
    expect(bsvRowOf({ ...base, satoshis: 0, isOutgoing: true, description: 'AMM swap tokens' })).toBeNull();
    expect(bsvRowOf({ ...base, satoshis: 0, isOutgoing: false, outputs: [out(1, 'p color abc')] })).toBeNull();
  });

  test('sent and received follow the net sign', () => {
    expect(bsvRowOf({ ...base, satoshis: -635_814, isOutgoing: true })?.amountDisplay).toBe('-0.00635814 BSV');
    expect(bsvRowOf({ ...base, satoshis: 5_012, isOutgoing: false })?.amountDisplay).toBe('+5,012 sats');
  });

  test('token and ordinal actions belong to other lists', () => {
    expect(bsvRowOf({ ...base, satoshis: -200, isOutgoing: true, labels: ['p 1sat transfer'] })).toBeNull();
    expect(bsvRowOf({ ...base, satoshis: -200, isOutgoing: true, outputs: [out(1, 'ordinals')] })).toBeNull();
  });
});

describe('historyKindOf', () => {
  test('an action the exchange client labelled is a swap row', () => {
    expect(historyKindOf(['amm-swap', 'p color'])).toBe('swap');
    expect(historyKindOf(['p color'])).toBeUndefined();
    expect(historyKindOf(undefined)).toBeUndefined();
  });
});
