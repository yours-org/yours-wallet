import { WOC_MAINNET_URL, WOC_TESTNET_URL, EXCHANGE_RATE_CACHE_TTL } from '@1sat/actions';
import { sendMessageAsync } from './chromeHelpers';
import { YoursEventName } from '../inject';

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

export async function getWalletBalance(): Promise<number> {
  const response = await sendMessageAsync<{ success: boolean; data?: number; error?: string }>({
    action: YoursEventName.GET_BALANCE,
  });
  if (!response.success) {
    throw new Error(response.error || 'Failed to get balance');
  }
  return response.data ?? 0;
}
