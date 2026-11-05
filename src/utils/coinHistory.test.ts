import { describe, expect, test } from 'bun:test';
import { directionFromAction } from './coinHistory';

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
