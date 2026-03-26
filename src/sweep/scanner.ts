/**
 * Legacy address scanner — adapted from 1sat-stack sweep UI scanner.
 * Two-phase approach: SSE sync first, then txo.search with events for proper categorization.
 */
import type { OneSatServices } from '@1sat/client';
import type { IndexedOutput } from '@1sat/types';

export interface EnrichedOrdinal extends IndexedOutput {
  origin?: string;
  contentType?: string;
  name?: string;
}

export interface TokenBalance {
  tokenId: string;
  symbol?: string;
  decimals: number;
  totalAmount: bigint;
  outputs: IndexedOutput[];
  isActive: boolean;
}

export interface ScannedAssets {
  funding: IndexedOutput[];
  ordinals: EnrichedOrdinal[];
  opnsNames: EnrichedOrdinal[];
  bsv21Tokens: TokenBalance[];
  bsv20Tokens: IndexedOutput[];
  locked: IndexedOutput[];
  totalBsv: number;
}

export interface ScanProgress {
  phase: string;
  detail?: string;
}

function getEvent(events: string[], prefix: string): string | undefined {
  const e = events.find((ev) => ev.startsWith(prefix));
  return e ? e.slice(prefix.length) : undefined;
}

function getEvents(events: string[], prefix: string): string[] {
  return events.filter((e) => e.startsWith(prefix)).map((e) => e.slice(prefix.length));
}

function enrichOrdinal(out: IndexedOutput): EnrichedOrdinal {
  const events = out.events ?? [];
  const origin = getEvent(events, 'origin:');
  const types = getEvents(events, 'type:');
  const contentType = types.find((t) => t.includes('/')) ?? types[0];
  const name = getEvent(events, 'name:');
  return { ...out, origin, contentType, name };
}

async function groupBsv21Tokens(outputs: IndexedOutput[], services: OneSatServices): Promise<TokenBalance[]> {
  const groups = new Map<string, { outputs: IndexedOutput[]; totalAmount: bigint }>();

  for (const out of outputs) {
    const events = out.events ?? [];
    const tokenId = getEvent(events, 'bsv21:');
    if (!tokenId) continue;

    const amtStr = getEvent(events, 'amt:');
    const amount = amtStr ? BigInt(amtStr) : 0n;

    let group = groups.get(tokenId);
    if (!group) {
      group = { outputs: [], totalAmount: 0n };
      groups.set(tokenId, group);
    }
    group.outputs.push(out);
    group.totalAmount += amount;
  }

  if (groups.size === 0) return [];

  const tokenIds = [...groups.keys()];
  let details: Array<{
    tokenId: string;
    token?: { sym?: string; dec?: string; icon?: string };
    status?: { is_active?: boolean };
  }> = [];
  try {
    details = await services.bsv21.lookupTokens(tokenIds);
  } catch {
    // BSV21 service may not be available
  }

  const detailMap = new Map(details.map((d) => [d.tokenId, d]));
  const balances: TokenBalance[] = [];

  for (const [tokenId, group] of groups) {
    const detail = detailMap.get(tokenId);
    balances.push({
      tokenId,
      symbol: detail?.token?.sym,
      decimals: Number(detail?.token?.dec ?? 0),
      totalAmount: group.totalAmount,
      outputs: group.outputs,
      isActive: detail?.status?.is_active ?? false,
    });
  }
  return balances;
}

function categorizeOutputs(
  outputs: IndexedOutput[],
  services: OneSatServices,
): Promise<ScannedAssets> & { sync: Promise<ScannedAssets> } {
  const funding: IndexedOutput[] = [];
  const rawOrdinals: IndexedOutput[] = [];
  const opnsRaw: IndexedOutput[] = [];
  const bsv21Raw: IndexedOutput[] = [];
  const bsv20Tokens: IndexedOutput[] = [];
  const locked: IndexedOutput[] = [];

  for (const out of outputs) {
    const events = out.events ?? [];
    const sats = out.satoshis ?? 0;

    if (events.some((e) => e.startsWith('bsv21:'))) {
      bsv21Raw.push(out);
      continue;
    }

    if (events.some((e) => e.startsWith('lock:'))) {
      locked.push(out);
      continue;
    }

    if (events.some((e) => e === 'type:application/bsv-20' || e === 'type:Token')) {
      bsv20Tokens.push(out);
      continue;
    }

    if (sats === 1) {
      if (events.some((e) => e === 'type:application/op-ns')) {
        opnsRaw.push(out);
      } else {
        rawOrdinals.push(out);
      }
      continue;
    }

    if (sats > 1) {
      funding.push(out);
    }
  }

  const result = groupBsv21Tokens(bsv21Raw, services).then((bsv21Tokens) => ({
    funding,
    ordinals: rawOrdinals.map(enrichOrdinal),
    opnsNames: opnsRaw.map(enrichOrdinal),
    bsv21Tokens,
    bsv20Tokens,
    locked,
    totalBsv: funding.reduce((sum, o) => sum + (o.satoshis ?? 0), 0),
  }));

  return Object.assign(result, { sync: result });
}

export async function scanAddress(
  services: OneSatServices,
  address: string,
  onProgress?: (p: ScanProgress) => void,
): Promise<ScannedAssets> {
  // Phase 1: Trigger owner sync via SSE stream
  onProgress?.({ phase: 'sync', detail: 'Syncing address...' });
  for await (const event of services.owner.getTxos(address, { refresh: true, limit: 1 })) {
    if (event.type === 'sync') {
      const p = event.data as { phase?: string; processed?: number; total?: number };
      onProgress?.({
        phase: 'sync',
        detail: `${p.phase ?? 'syncing'}: ${p.processed ?? 0}/${p.total ?? '?'}`,
      });
    } else if (event.type === 'done' || event.type === 'error') {
      break;
    }
  }

  // Phase 2: Search for all unspent outputs with events
  onProgress?.({ phase: 'search', detail: 'Searching for assets...' });
  const allOutputs = await services.txo.search(`own:${address}`, {
    unspent: true,
    events: true,
    sats: true,
    limit: 0,
  });

  // Phase 3: Categorize
  onProgress?.({ phase: 'categorize', detail: 'Categorizing assets...' });
  return await categorizeOutputs(allOutputs, services);
}

export async function scanAddresses(
  services: OneSatServices,
  addresses: string[],
  onProgress?: (p: ScanProgress) => void,
): Promise<ScannedAssets> {
  const unique = [...new Set(addresses)];
  const allResults: ScannedAssets[] = [];

  for (const addr of unique) {
    onProgress?.({ phase: 'sync', detail: `Scanning ${addr.slice(0, 8)}...` });
    allResults.push(await scanAddress(services, addr, onProgress));
  }

  return {
    funding: allResults.flatMap((r) => r.funding),
    ordinals: allResults.flatMap((r) => r.ordinals),
    opnsNames: allResults.flatMap((r) => r.opnsNames),
    bsv21Tokens: allResults.flatMap((r) => r.bsv21Tokens),
    bsv20Tokens: allResults.flatMap((r) => r.bsv20Tokens),
    locked: allResults.flatMap((r) => r.locked),
    totalBsv: allResults.reduce((sum, r) => sum + r.totalBsv, 0),
  };
}
