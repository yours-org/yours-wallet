/** UI enrichment adapter over the native, complete owner-address scanner. */
import { scanAddress as scanAddressUtxos, scanAddresses as scanAddressesUtxos, type ScanResult } from '@1sat/actions';
import type { OneSatServices } from '@1sat/client';
import type { IndexedOutput } from '@1sat/types';
import type { ScanProgress, TokenBalance } from '@1sat/actions';
export type { ScanProgress, TokenBalance };

export interface EnrichedOrdinal extends IndexedOutput {
  origin?: string;
  contentType?: string;
  name?: string;
  contentUrl: string;
}

export interface ScannedAssets extends Omit<ScanResult, 'ordinals' | 'opnsNames' | 'listings'> {
  ordinals: EnrichedOrdinal[];
  opnsNames: EnrichedOrdinal[];
  listings: EnrichedOrdinal[];
  totalBsv: number;
}

function enrichOrdinal(output: IndexedOutput, services: OneSatServices): EnrichedOrdinal {
  const events = output.events ?? [];
  const value = (prefix: string) => events.find((event) => event.startsWith(prefix))?.slice(prefix.length);
  const types = events.filter((event) => event.startsWith('type:')).map((event) => event.slice(5));
  const origin = value('origin:');
  return {
    ...output,
    origin,
    contentType: types.find((type) => type.includes('/')) ?? types[0],
    name: value('name:'),
    contentUrl: services.ordfs.getContentUrl(origin ?? output.outpoint, { raw: true }),
  };
}

function enrich(result: ScanResult, services: OneSatServices): ScannedAssets {
  return {
    ...result,
    ordinals: result.ordinals.map((output) => enrichOrdinal(output, services)),
    opnsNames: result.opnsNames.map((output) => enrichOrdinal(output, services)),
    listings: result.listings.map((output) => enrichOrdinal(output, services)),
    totalBsv: result.totalFundingSats,
  };
}

export async function scanAddress(
  services: OneSatServices,
  address: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScannedAssets> {
  return enrich(await scanAddressUtxos(services, address, onProgress), services);
}

export async function scanAddresses(
  services: OneSatServices,
  addresses: string[],
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScannedAssets> {
  return enrich(await scanAddressesUtxos(services, addresses, onProgress), services);
}
