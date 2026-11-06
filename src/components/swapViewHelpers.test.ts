import { describe, expect, test } from 'bun:test';
import {
  acceptsAmountInput,
  bpsToPercentText,
  formatRate,
  parseAmount,
  shortOutpoint,
  subtractCushion,
  swapErrorText,
  tokensPerBsv,
  compactAmount,
} from './swapViewHelpers';

describe('parseAmount', () => {
  test('converts to base units without floats', () => {
    expect(parseAmount('1', 8)).toEqual({ ok: true, value: '100000000' });
    expect(parseAmount('0.1', 8)).toEqual({ ok: true, value: '10000000' });
    expect(parseAmount('0.00000001', 8)).toEqual({ ok: true, value: '1' });
    expect(parseAmount('12345678901234567890.5', 2)).toEqual({ ok: true, value: '1234567890123456789050' });
    expect(parseAmount('.5', 1)).toEqual({ ok: true, value: '5' });
    expect(parseAmount('3.', 0)).toEqual({ ok: true, value: '3' });
    expect(parseAmount('0', 8)).toEqual({ ok: true, value: '0' });
  });
  test('rejects bad input', () => {
    expect(parseAmount('', 8)).toEqual({ ok: false, reason: 'empty' });
    expect(parseAmount('.', 8)).toEqual({ ok: false, reason: 'empty' });
    expect(parseAmount('1e5', 8)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseAmount('-1', 8)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseAmount('1.2.3', 8)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseAmount('0.123', 2)).toEqual({ ok: false, reason: 'decimals' });
    expect(parseAmount('1.5', 0)).toEqual({ ok: false, reason: 'decimals' });
  });
});

describe('acceptsAmountInput', () => {
  test('allows partial input within decimals', () => {
    expect(acceptsAmountInput('1.', 2)).toBe(true);
    expect(acceptsAmountInput('1.23', 2)).toBe(true);
    expect(acceptsAmountInput('1.234', 2)).toBe(false);
    expect(acceptsAmountInput('1.', 0)).toBe(false);
    expect(acceptsAmountInput('abc', 2)).toBe(false);
  });
});

describe('rates and fees', () => {
  test('tokensPerBsv', () => {
    expect(tokensPerBsv(1000)).toBe(100000);
    expect(tokensPerBsv(0)).toBe(0);
  });
  test('formatRate', () => {
    expect(formatRate(100000)).toBe('100,000');
    expect(formatRate(0.000123456789)).toBe('0.000123457');
  });
  test('bpsToPercentText', () => {
    expect(bpsToPercentText(30)).toBe('0.3');
    expect(bpsToPercentText(100)).toBe('1');
    expect(bpsToPercentText(125)).toBe('1.25');
  });
  test('shortOutpoint', () => {
    expect(shortOutpoint('abc12345deadbeefcafe_6789')).toBe('abc12345…6789');
    expect(shortOutpoint('short')).toBe('short');
  });
  test('subtractCushion', () => {
    expect(subtractCushion(5000n, 2000n)).toBe(3000n);
    expect(subtractCushion(1000n, 2000n)).toBe(0n);
  });
  test('swapErrorText', () => {
    expect(swapErrorText('stale_pool', 'x')).toContain('price moved');
    expect(swapErrorText(undefined, 'boom')).toBe('boom');
  });
});

describe('compactAmount', () => {
  test('trims the fraction to what the size warrants and groups thousands', () => {
    expect(compactAmount('245278.8768858')).toBe('245,278.87');
    expect(compactAmount('0.001')).toBe('0.001');
    expect(compactAmount('0.00123456789')).toBe('0.001234');
    expect(compactAmount('1.23456789')).toBe('1.2345');
    expect(compactAmount('1000')).toBe('1,000');
    expect(compactAmount('12.50')).toBe('12.5');
    expect(compactAmount('0')).toBe('0');
  });
});
