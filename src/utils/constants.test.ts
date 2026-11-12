import { describe, expect, test } from 'bun:test';
import { ammPoolsUrlOf, ammSiteUrlOf } from './constants';

const ASSET = `${'a'.repeat(64)}_0`;

describe('ammPoolsUrlOf', () => {
  test('testnet lands on the pools page with the token selected', () => {
    expect(ammPoolsUrlOf('test', ASSET)).toBe(`https://1sat-amm.vercel.app/pools?token=${ASSET}`);
  });

  test('mainnet has no site yet, so no link', () => {
    expect(ammSiteUrlOf('main')).toBeUndefined();
    expect(ammPoolsUrlOf('main', ASSET)).toBeUndefined();
  });
});
