import { describe, expect, test } from 'bun:test';
import { aggregatePoolReserves, getOneColorPrices, priceBsvOf, tokenUsdValue, tokensUsdTotal } from './oneColorPrices';
import type { WalletToken } from './walletTokens';

const A = `${'a'.repeat(64)}_0`;
const B = `${'b'.repeat(64)}_0`;
const C = `${'c'.repeat(64)}_0`;

const jsonFetch = (answers: Record<string, unknown>, calls: string[] = []) =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const origin = new URL(url).origin;
    if (!(origin in answers)) return new Response('nope', { status: 503 });
    return new Response(JSON.stringify(answers[origin]), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

describe('aggregatePoolReserves', () => {
  test('sums every pool of a token and keeps reserves above 2^53 exact', () => {
    const big = '90071992547409920000'; // 10,000 × 2^53
    const rows = [
      { tokenId: A, bsvReserve: 100_000_000, tokenReserve: '5000' },
      { tokenId: A, bsvReserve: 50_000_000, tokenReserve: '2500' },
      { tokenId: B, bsvReserve: 1, tokenReserve: big },
    ];
    const byToken = aggregatePoolReserves(rows);
    expect(byToken.get(A)).toEqual({ bsv: 150_000_000n, token: 7500n });
    expect(byToken.get(B)).toEqual({ bsv: 1n, token: BigInt(big) });
  });

  test('skips rows missing a field, and non-array bodies', () => {
    expect(aggregatePoolReserves([{ tokenId: A, bsvReserve: 1 }, null, 'x']).size).toBe(0);
    expect(aggregatePoolReserves({ pools: [] }).size).toBe(0);
    expect(aggregatePoolReserves([{ tokenId: A, bsvReserve: -1, tokenReserve: 1 }]).size).toBe(0);
  });
});

describe('priceBsvOf', () => {
  test('1.5 BSV against 7500 base units at 2 decimals is 0.02 BSV per token', () => {
    expect(priceBsvOf({ bsv: 150_000_000n, token: 7500n }, 2)).toBe(0.02);
  });

  test('zero decimals and no reserve', () => {
    expect(priceBsvOf({ bsv: 100_000_000n, token: 4n }, 0)).toBe(0.25);
    expect(priceBsvOf({ bsv: 100_000_000n, token: 0n }, 0)).toBeNull();
  });

  test('a tiny price keeps twelve decimals', () => {
    expect(priceBsvOf({ bsv: 1n, token: 1_000_000n }, 0)).toBe(0); // 1e-14 BSV is below the twelve-decimal precision
    expect(priceBsvOf({ bsv: 1_000n, token: 1_000_000n }, 0)).toBe(1e-11);
  });
});

describe('getOneColorPrices', () => {
  test('fetches each origin once and prices only tokens with a pool there', async () => {
    const calls: string[] = [];
    const fetchFn = jsonFetch(
      {
        'https://x.test': [{ tokenId: A, bsvReserve: 100_000_000, tokenReserve: 1000 }],
        'https://y.test': [{ tokenId: B, bsvReserve: 200_000_000, tokenReserve: 1000 }],
      },
      calls,
    );
    const origins: Record<string, string | undefined> = {
      [A]: 'https://x.test',
      [B]: 'https://y.test',
      [C]: 'https://x.test',
    };
    const prices = await getOneColorPrices(
      [
        { assetId: A, dec: 0 },
        { assetId: B, dec: 0 },
        { assetId: C, dec: 0 },
      ],
      async (id) => origins[id],
      fetchFn,
    );
    expect(prices.get(A)).toBe(0.001);
    expect(prices.get(B)).toBe(0.002);
    expect(prices.has(C)).toBe(false);
    expect(calls.sort()).toEqual(['https://x.test/amm/pools', 'https://y.test/amm/pools']);
  });

  test('no origin (mainnet) or a failing origin leaves tokens unpriced without throwing', async () => {
    const fetchFn = jsonFetch({});
    const prices = await getOneColorPrices(
      [
        { assetId: A, dec: 0 },
        { assetId: B, dec: 0 },
      ],
      async (id) => (id === A ? undefined : 'https://down.test'),
      fetchFn,
    );
    expect(prices.size).toBe(0);
  });

  test('a resolver that throws for one token does not stop the others', async () => {
    const fetchFn = jsonFetch({ 'https://x.test': [{ tokenId: B, bsvReserve: 1_000_000, tokenReserve: 100 }] });
    const prices = await getOneColorPrices(
      [
        { assetId: A, dec: 0 },
        { assetId: B, dec: 2 },
      ],
      async (id) => {
        if (id === A) throw new Error('no overlay');
        return 'https://x.test';
      },
      fetchFn,
    );
    expect(prices.get(B)).toBe(0.01);
  });
});

describe('USD values', () => {
  const token = (id: string, confirmed: bigint, pending: bigint, dec: number, kind: WalletToken['kind'] = '1color') =>
    ({ kind, id, name: id, icon: '', dec, confirmed, pending }) as WalletToken;

  test('tokenUsdValue is null without a price', () => {
    expect(tokenUsdValue(100n, 2, undefined, 50)).toBeNull();
    expect(tokenUsdValue(150n, 2, 0.02, 50)).toBe(1.5);
  });

  test('tokensUsdTotal counts priced 1Color balances only: no pending, no unpriced, no BSV21', () => {
    const prices = new Map([[A, 0.02]]);
    const total = tokensUsdTotal(
      [token(A, 100n, 50n, 2), token(B, 1000n, 0n, 0), token(A, 1n, 0n, 0, 'bsv21')],
      prices,
      50,
    );
    expect(total).toBe(1);
  });
});
