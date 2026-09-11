import {
  deriveDepositAddresses as sdkDeriveDepositAddresses,
  syncAddresses as sdkSyncAddresses,
  ProcessedTxStoreIdb,
  internalizeBeef,
  sweepDeposit,
  ONESAT_PROTOCOL,
  LEGACY_ONESAT_PROTOCOL,
  type OutputDerivation,
  type OneSatContext,
  type DeriveDepositAddressesInput,
  type DeriveDepositAddressesResult,
  type SyncAddressesInput,
  type SyncAddressesResult,
} from '@1sat/actions';
import type { PromptRequest } from '@1sat/permission-module';
import type { SyncOutput } from '@1sat/types';
import { getNetwork, isValidAddress, toNetworkAddress, type Chain } from './network';
import { NetWork } from '../services/types/provider.types';

/** @1sat/actions 0.0.212 returns mainnet addresses regardless of the context chain. */
export const deriveDepositAddresses = {
  ...sdkDeriveDepositAddresses,
  execute: async (ctx: OneSatContext, input: DeriveDepositAddressesInput): Promise<DeriveDepositAddressesResult> => {
    const result = await sdkDeriveDepositAddresses.execute(ctx, input);
    const network = getNetwork(ctx.chain);
    return {
      ...result,
      derivations: result.derivations.map((derivation) => ({
        ...derivation,
        address: toNetworkAddress(derivation.address, network),
      })),
    };
  },
};

/** Use SDK derivation and internalization with an explicit chain and a separate sync cursor. */
export const syncAddresses = {
  ...sdkSyncAddresses,
  execute: async (ctx: OneSatContext, input: SyncAddressesInput): Promise<SyncAddressesResult> => {
    const { services, wallet, chain } = ctx;
    if (!services) throw new Error('syncAddresses requires services in context');
    const { publicKey: identityKey } = await wallet.getPublicKey({ identityKey: true });
    const addressDerivations = new Map<string, OutputDerivation>();
    for (const protocolID of [ONESAT_PROTOCOL, LEGACY_ONESAT_PROTOCOL]) {
      const { derivations } = await deriveDepositAddresses.execute(ctx, { ...input, protocolID });
      for (const derivation of derivations) {
        addressDerivations.set(derivation.address, { ...derivation, outputIndex: 0, protocolID, counterparty: 'self' });
      }
    }
    const addresses = [...addressDerivations.keys()];
    const store = new ProcessedTxStoreIdb(chain === 'test' ? `test-${identityKey}` : identityKey);
    try {
      const { height } = await wallet.getHeight({});
      const lastScore = await store.getLastScore();
      let maxSafeScore = lastScore;
      const transactions = new Map<string, SyncOutput[]>();
      for await (const output of services.owner.sync(addresses, lastScore || undefined, input.onProgress)) {
        const txid = output.outpoint.substring(0, 64);
        const outputs = transactions.get(txid) ?? [];
        outputs.push(output);
        transactions.set(txid, outputs);
        if (height - Math.floor(output.score) >= 6) maxSafeScore = Math.max(maxSafeScore, output.score);
      }
      let processed = 0;
      let failed = 0;
      for (const [txid, outputs] of transactions) {
        if (await store.has(txid)) continue;
        try {
          if (!outputs.every((output) => output.spendTxid)) {
            const beef = await services.beef.getBeef(txid);
            if (!beef) throw new Error(`Failed to load BEEF for ${txid}`);
            await internalizeBeef({ beef, addressDerivations, wallet, services, chain });
          }
          await store.add(txid);
          processed++;
        } catch (error) {
          console.error(`[syncAddresses] Failed to process ${txid}:`, error);
          failed++;
        }
      }
      // Failed transactions must be fetched again; only advance beyond fully processed outputs.
      if (failed === 0 && maxSafeScore > lastScore) await store.setLastScore(maxSafeScore);
      try {
        await sweepDeposit.execute(ctx, {});
      } catch (error) {
        console.error('[syncAddresses] sweepDeposit failed:', error);
      }
      return { processed, failed, lastScore: maxSafeScore, addresses };
    } finally {
      await store.close();
    }
  },
};

const MAINNET_P2PKH = /1[a-km-zA-HJ-NP-Z1-9]{25,33}/g;

const remapAddressText = (value: string, network: NetWork): string => {
  if (isValidAddress(value, 'main')) return toNetworkAddress(value, network);
  return value.replace(MAINNET_P2PKH, (address) =>
    isValidAddress(address, 'main') ? toNetworkAddress(address, network) : address,
  );
};

const remapValue = (value: unknown, network: NetWork): unknown => {
  if (typeof value === 'string') return remapAddressText(value, network);
  if (Array.isArray(value)) return value.map((item) => remapValue(item, network));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapValue(item, network)]));
  }
  return value;
};

/** @1sat/permission-module 0.0.52 decodes prompt recipients as mainnet unless chain is passed. */
export const remapPromptRequest = (request: PromptRequest, chain: Chain): PromptRequest => {
  if (chain !== 'test') return request;
  const network = getNetwork(chain);
  return {
    ...request,
    summary: remapAddressText(request.summary, network),
    payload: remapValue(request.payload, network) as PromptRequest['payload'],
  };
};
