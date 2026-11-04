import { describe, expect, test } from 'bun:test';
import { normalize, removeTrailingZeros, showAmount } from './format';

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
