/**
 * Prices for the 1Color tokens the wallet holds, from Open Exchange pools.
 *
 * `GET <origin>/amm/pools` lists every on-chain pool the exchange knows, one
 * row per pool: `tokenId` (the 1Color asset id, the same `<txid>_<vout>` as
 * the wallet's holdings), `bsvReserve` in satoshis and `tokenReserve` in the
 * token's base units. A token's price in BSV is the ratio of its summed
 * reserves. No pool for a token means no price: the list shows "—", never 0.
 *
 * The origin is the asset's overlay origin as the wallet already resolves it
 * (Settings > Token overlays override, else the chain default; mainnet has
 * none yet, so mainnet tokens have no price). Tokens are grouped by origin so
 * each exchange is fetched once per refresh. Reserves stay bigint until the
 * final division: some token reserves exceed 2^53.
 */
import type { WalletToken } from './walletTokens';

export const POOLS_PATH = '/amm/pools';

export type PoolReserves = { bsv: bigint; token: bigint };

/** Twelve decimals of price precision survive the bigint → number step. */
const PRICE_SCALE = 12;

const toBigInt = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return null;
};

/** Sum each token's reserves across its pools; rows without the three fields are skipped. */
export const aggregatePoolReserves = (rows: unknown): Map<string, PoolReserves> => {
  const byToken = new Map<string, PoolReserves>();
  if (!Array.isArray(rows)) return byToken;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const { tokenId, bsvReserve, tokenReserve } = row as Record<string, unknown>;
    const bsv = toBigInt(bsvReserve);
    const token = toBigInt(tokenReserve);
    if (typeof tokenId !== 'string' || bsv === null || token === null) continue;
    const entry = byToken.get(tokenId) ?? { bsv: 0n, token: 0n };
    byToken.set(tokenId, { bsv: entry.bsv + bsv, token: entry.token + token });
  }
  return byToken;
};

/** BSV per whole token: (bsv / 1e8) / (token / 10^dec), or null when there is no token reserve. */
export const priceBsvOf = (reserves: PoolReserves, dec: number): number | null => {
  if (reserves.token <= 0n || !Number.isInteger(dec) || dec < 0) return null;
  const scaled = (reserves.bsv * 10n ** BigInt(dec) * 10n ** BigInt(PRICE_SCALE)) / (reserves.token * 10n ** 8n);
  return Number(scaled) / 10 ** PRICE_SCALE;
};

/** The exchange's pool rows, aggregated per token; throws on a network or HTTP failure. */
export const fetchPoolReserves = async (
  origin: string,
  fetchFn: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<Map<string, PoolReserves>> => {
  const response = await fetchFn(`${origin}${POOLS_PATH}`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${origin}${POOLS_PATH}: HTTP ${response.status}`);
  return aggregatePoolReserves(await response.json());
};

export type PricedToken = { assetId: string; dec: number };

/**
 * BSV price per whole token for every token that has a pool at its origin.
 * One fetch per distinct origin; an origin that fails, or a token with no
 * origin, leaves its tokens unpriced.
 */
export const getOneColorPrices = async (
  tokens: PricedToken[],
  resolveOrigin: (assetId: string) => Promise<string | undefined>,
  fetchFn?: typeof fetch,
): Promise<Map<string, number>> => {
  const byOrigin = new Map<string, PricedToken[]>();
  await Promise.all(
    tokens.map(async (t) => {
      const origin = await resolveOrigin(t.assetId).catch(() => undefined);
      if (!origin) return;
      byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), t]);
    }),
  );
  const prices = new Map<string, number>();
  await Promise.all(
    [...byOrigin].map(async ([origin, group]) => {
      let reserves: Map<string, PoolReserves>;
      try {
        reserves = await fetchPoolReserves(origin, fetchFn);
      } catch (error) {
        console.warn(`[oneColorPrices] ${origin} unavailable:`, error);
        return;
      }
      for (const t of group) {
        const r = reserves.get(t.assetId);
        const price = r && priceBsvOf(r, t.dec);
        if (price !== null && price !== undefined) prices.set(t.assetId, price);
      }
    }),
  );
  return prices;
};

/** A token amount's USD value, or null when the token has no price. */
export const tokenUsdValue = (
  amount: bigint,
  dec: number,
  priceBsv: number | undefined,
  bsvUsdRate: number,
): number | null => {
  if (priceBsv === undefined) return null;
  const whole = Number(amount) / 10 ** dec;
  return whole * priceBsv * bsvUsdRate;
};

/** USD across every priced 1Color holding (available and reserved both belong to the wallet). */
export const tokensUsdTotal = (tokens: WalletToken[], prices: Map<string, number>, bsvUsdRate: number): number =>
  tokens.reduce((sum, t) => {
    if (t.kind !== '1color') return sum;
    return sum + (tokenUsdValue(t.confirmed + t.pending, t.dec, prices.get(t.id), bsvUsdRate) ?? 0);
  }, 0);
