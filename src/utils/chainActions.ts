import {
  deriveDepositAddresses as sdkDeriveDepositAddresses,
  syncAddresses as sdkSyncAddresses,
  ProcessedTxStoreIdb,
  type OneSatContext,
  type DeriveDepositAddressesInput,
  type DeriveDepositAddressesResult,
  type SyncAddressesInput,
  type SyncAddressesResult,
} from '@1sat/actions';
import { PrivateKey, PublicKey } from '@bsv/sdk';
import { getNetwork, toNetworkAddress, type Chain } from './network';

type StoreProto = { getDb: () => Promise<unknown>; dbName: string };

const originalPublicToAddress = PublicKey.prototype.toAddress;
const originalPrivateToAddress = PrivateKey.prototype.toAddress;
const storeProto = ProcessedTxStoreIdb.prototype as unknown as StoreProto;
const originalGetDb = storeProto.getDb;

let chainAwareDepth = 0;

const installChainAwareSdk = (chain: Chain) => {
  const network = getNetwork(chain);
  PublicKey.prototype.toAddress = function (prefix) {
    return originalPublicToAddress.call(this, prefix ?? network);
  };
  PrivateKey.prototype.toAddress = function (prefix) {
    return originalPrivateToAddress.call(this, prefix ?? network);
  };
  storeProto.getDb = function (this: StoreProto) {
    if (this.dbName.startsWith('sync-processed-') && !this.dbName.startsWith('sync-processed-test-')) {
      this.dbName = this.dbName.replace('sync-processed-', 'sync-processed-test-');
    }
    return originalGetDb.call(this);
  };
};

const uninstallChainAwareSdk = () => {
  PublicKey.prototype.toAddress = originalPublicToAddress;
  PrivateKey.prototype.toAddress = originalPrivateToAddress;
  storeProto.getDb = originalGetDb;
};

/** @1sat/actions 0.0.212 encodes P2PKH as mainnet and shares the sync cursor by identity key. */
export const withChainAwareSdk = async <T>(chain: Chain, fn: () => Promise<T>): Promise<T> => {
  if (chain !== 'test') return fn();
  if (chainAwareDepth++ === 0) installChainAwareSdk(chain);
  try {
    return await fn();
  } finally {
    if (--chainAwareDepth === 0) uninstallChainAwareSdk();
  }
};

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

export const syncAddresses = {
  ...sdkSyncAddresses,
  execute: (ctx: OneSatContext, input: SyncAddressesInput): Promise<SyncAddressesResult> =>
    withChainAwareSdk(ctx.chain, () => sdkSyncAddresses.execute(ctx, input)),
};
