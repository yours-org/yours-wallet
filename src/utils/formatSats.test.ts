import * as format from './format';

describe('formatSats', () => {
  it('renders 0 sats as "0.00000000"', () => {
    expect(format.formatSats(0)).toBe('0.00000000');
  });

  it('renders small satoshi amounts without scientific notation', () => {
    // Bug: 18 / 100_000_000 rendered as "1.8e-7" without formatting
    expect(format.formatSats(18)).toBe('0.00000018');
  });

  it('renders whole BSV amounts with full decimals', () => {
    expect(format.formatSats(100000000)).toBe('1.00000000');
  });

  it('renders amounts with full 8 decimal places', () => {
    expect(format.formatSats(100668309)).toBe('1.00668309');
  });
});
