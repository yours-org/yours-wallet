/** UI enrichment adapter over the native, complete owner-address scanner. */
import { scanAddress as scanAddressUtxos, scanAddresses as scanAddressesUtxos, type ScanResult } from '@1sat/actions';
import type { OneSatServices } from '@1sat/client';
import type { IndexedOutput } from '@1sat/types';
export type { TokenBalance, ScanProgress } from '@1sat/actions';
import type { ScanProgress } from '@1sat/actions';

export interface EnrichedOrdinal extends IndexedOutput {
  origin?: string;
  contentType?: string;
  name?: string;
}

export interface ScannedAssets extends Omit<ScanResult, 'ordinals' | 'opnsNames' | 'listings' | 'totalFundingSats'> {
  ordinals: EnrichedOrdinal[];
  opnsNames: EnrichedOrdinal[];
  listings: EnrichedOrdinal[];
  totalBsv: number;
}

function enrichOrdinal(output: IndexedOutput): EnrichedOrdinal {
  const events = output.events ?? [];
  const value = (prefix: string) => events.find((event) => event.startsWith(prefix))?.slice(prefix.length);
  const types = events.filter((event) => event.startsWith('type:')).map((event) => event.slice(5));
  return {
    ...output,
    origin: value('origin:'),
    contentType: types.find((type) => type.includes('/')) ?? types[0],
    name: value('name:'),
  };
}

function enrich(result: ScanResult): ScannedAssets {
  return {
    ...result,
    ordinals: result.ordinals.map(enrichOrdinal),
    opnsNames: result.opnsNames.map(enrichOrdinal),
    listings: result.listings.map(enrichOrdinal),
    totalBsv: result.totalFundingSats,
  };
}

export async function scanAddress(
  services: OneSatServices,
  address: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScannedAssets> {
  return enrich(await scanAddressUtxos(services, address, onProgress));
}

export async function scanAddresses(
  services: OneSatServices,
  addresses: string[],
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScannedAssets> {
  return enrich(await scanAddressesUtxos(services, addresses, onProgress));
}
