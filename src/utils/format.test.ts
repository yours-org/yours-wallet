import { describe, expect, test } from 'bun:test';
import {
  normalize,
  removeTrailingZeros,
  showAmount,
  formatTokenAmount,
  compactDecimal,
  displayAmount,
  displayNumber,
} from './format';

describe('showAmount', () => {
  test('drops trailing zeros after the point, and the point itself', () => {
    expect(showAmount(90000000000000n, 7)).toBe('9000000');
    expect(showAmount(2646227469473n, 7)).toBe('264622.7469473');
    expect(showAmount(150n, 2)).toBe('1.5');
    expect(showAmount(100n, 2)).toBe('1');
    expect(showAmount(5n, 3)).toBe('0.005');
    expect(showAmount(0n, 4)).toBe('0');
  });

  test('zero decimals and whole numbers keep their zeros', () => {
    expect(showAmount(1000n, 0)).toBe('1000');
    expect(showAmount(10000000n, 2)).toBe('100000');
  });

  test('round-trips through normalize for the MAX fill', () => {
    expect(normalize(showAmount(90000000000000n, 7), 7)).toBe('90000000000000');
    expect(normalize(showAmount(150n, 2), 2)).toBe('150');
  });
});

describe('removeTrailingZeros', () => {
  test('leaves strings without a point alone', () => {
    expect(removeTrailingZeros('1000')).toBe('1000');
    expect(removeTrailingZeros('1,000.00')).toBe('1,000');
  });
});

describe('formatTokenAmount', () => {
  test('groups the whole part and keeps the trimmed fraction', () => {
    expect(formatTokenAmount(1000000n, 0)).toBe('1,000,000');
    expect(formatTokenAmount(123450n, 2)).toBe('1,234.5');
    expect(formatTokenAmount(999n, 0)).toBe('999');
    expect(formatTokenAmount(50n, 2)).toBe('0.5');
    expect(formatTokenAmount(0n, 4)).toBe('0');
  });

  test('is exact above 2^53', () => {
    expect(formatTokenAmount(90071992547409920000n, 2)).toBe('900,719,925,474,099,200');
  });
});

describe('displayAmount', () => {
  test('groups thousands and trims the fraction to the size', () => {
    expect(compactDecimal('245278.8768858')).toBe('245,278.87');
    expect(compactDecimal('500000000')).toBe('500,000,000');
    expect(compactDecimal('1.23456789')).toBe('1.2345');
    expect(compactDecimal('0.00123456789')).toBe('0.001234');
    expect(compactDecimal('12.50')).toBe('12.5');
    expect(compactDecimal('0')).toBe('0');
    expect(displayAmount(2646227469473n, 7)).toBe('264,622.74');
    expect(displayAmount(150n, 2)).toBe('1.5');
    expect(displayNumber(4.21083311)).toBe('4.2108');
    expect(displayNumber(0.00005)).toBe('0.00005');
  });
});
