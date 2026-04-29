const BSV_DECIMAL_CONVERSION = 100000000;

describe('BSV satoshi display', () => {
  it('renders small satoshi amounts without scientific notation', () => {
    const result = String(18 / BSV_DECIMAL_CONVERSION);
    expect(result).toBe('1.8e-7'); // currently shows this — bug
    expect(result).toBe('0.00000018'); // should show this
  });
});
