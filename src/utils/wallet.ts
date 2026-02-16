import type { WalletInterface } from '@bsv/sdk';
import { WOC_MAINNET_URL, WOC_TESTNET_URL, EXCHANGE_RATE_CACHE_TTL } from '@1sat/actions';

// From @bsv/wallet-toolbox-mobile specOpWalletBalance
const BALANCE_BASKET = '893b7646de0e1c9f741bd6e9169b76a8847ae34adef7bef1e6a285371206d2e8';

let exchangeRateCache: { rate: number; timestamp: number } | null = null;

export async function fetchExchangeRate(chain: 'main' | 'test', wocApiKey?: string): Promise<number> {
  if (exchangeRateCache && Date.now() - exchangeRateCache.timestamp < EXCHANGE_RATE_CACHE_TTL) {
    return exchangeRateCache.rate;
  }
  const baseUrl = chain === 'main' ? WOC_MAINNET_URL : WOC_TESTNET_URL;
  const headers: Record<string, string> = {};
  if (wocApiKey) headers['woc-api-key'] = wocApiKey;
  try {
    const response = await fetch(`${baseUrl}/exchangerate`, { headers });
    if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
    const data = await response.json();
    const rate = Number(data.rate.toFixed(2));
    exchangeRateCache = { rate, timestamp: Date.now() };
    return rate;
  } catch {
    return exchangeRateCache?.rate ?? 0;
  }
}

export async function getWalletBalance(wallet: WalletInterface): Promise<number> {
  const r = await wallet.listOutputs({ basket: BALANCE_BASKET });
  return r.totalOutputs;
}
