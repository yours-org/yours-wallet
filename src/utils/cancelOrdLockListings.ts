/** Owner delisting for the OrdLock deprecation, shared by ordinal and sweep views. */
import type { WalletOutput } from '@bsv/sdk';
import { cancelOrdinalListing, listOrdinals, type OneSatContext } from '@1sat/actions';
import { readAssetIdTag } from '@1sat/types';
import { createAccountBoundContext } from './accountBoundWallet';

export const ORDLOCK_LISTING_DISABLED_MESSAGE =
  'OrdLock listing creation is deprecated pending a replacement contract. Existing listings can still be cancelled or bought.';

export const ORDLOCK_CANCEL_INCOMPLETE_MESSAGE =
  'Listing cancellation is incomplete. Retry delisting before sending or sweeping funds.';

export type CancelOrdLockProgress = {
  total: number;
  attempted: number;
  cancelled: number;
  skipped: number;
};

export type CancelOrdLockResult = CancelOrdLockProgress & {
  cancelledOutpoints: string[];
  errors: string[];
};

export function isOrdLockListed(output: WalletOutput): boolean {
  return output.tags?.includes('ordlock') ?? false;
}

/**
 * Take a complete snapshot before cancelling: spending while paging would shift
 * offsets and skip listings. Each unique output is attempted once per invocation;
 * callers retry explicitly using a fresh discovery or the remaining selection.
 */
export async function cancelOwnedOrdLockListings(
  apiContext: OneSatContext,
  options?: {
    /** A complete manual selection; omit to discover all wallet-owned listings. */
    outputs?: WalletOutput[];
    /** Abort the pass when its view closes or its account changes. */
    signal?: AbortSignal;
    onProgress?: (progress: CancelOrdLockProgress) => void;
    /** Stop the calling send/sweep when discovery or any cancellation fails. */
    requireComplete?: boolean;
  },
): Promise<CancelOrdLockResult> {
  const result: CancelOrdLockResult = {
    total: 0,
    attempted: 0,
    cancelled: 0,
    skipped: 0,
    cancelledOutpoints: [],
    errors: [],
  };
  const progress = () => {
    const { total, attempted, cancelled, skipped } = result;
    options?.onProgress?.({ total, attempted, cancelled, skipped });
  };

  try {
    const context = await createAccountBoundContext(apiContext, options?.signal);
    const assertCurrent = async () => {
      options?.signal?.throwIfAborted();
      await context.wallet.getPublicKey({ identityKey: true });
      options?.signal?.throwIfAborted();
    };
    const outputs = new Map<string, WalletOutput>();
    if (options?.outputs) {
      for (const output of options.outputs) outputs.set(output.outpoint, output);
    } else {
      let offset = 0;
      while (true) {
        await assertCurrent();
        const page = await listOrdinals.execute(context, { tags: ['ordlock'], limit: 100, offset });
        if (page.outputs.length === 0) {
          if (page.totalOutputs !== undefined && offset < page.totalOutputs) {
            throw new Error('Listing discovery ended before all outputs were returned.');
          }
          break;
        }
        const previousSize = outputs.size;
        for (const output of page.outputs) outputs.set(output.outpoint, output);
        if (outputs.size === previousSize) throw new Error('Listing discovery did not advance. Retry delisting.');
        offset += page.outputs.length;
        if (page.totalOutputs !== undefined && offset >= page.totalOutputs) {
          if (outputs.size < page.totalOutputs) throw new Error('Listing discovery returned an incomplete snapshot.');
          break;
        }
      }
    }

    const listings = [...outputs.values()].filter(isOrdLockListed);
    result.total = listings.length;
    progress();
    for (const output of listings) {
      await assertCurrent();
      const id = readAssetIdTag(output.tags);
      if (!id) {
        result.skipped += 1;
        result.errors.push(`${output.outpoint}: missing tracking id`);
        progress();
        continue;
      }

      result.attempted += 1;
      try {
        const cancellation = await cancelOrdinalListing.execute(context, { id });
        await assertCurrent();
        if (!cancellation.txid || cancellation.error) {
          result.errors.push(`${output.outpoint}: ${cancellation.error || 'cancel-failed'}`);
        } else {
          result.cancelled += 1;
          result.cancelledOutpoints.push(output.outpoint);
        }
      } catch (err) {
        result.errors.push(`${output.outpoint}: ${err instanceof Error ? err.message : String(err)}`);
      }
      progress();
    }
    await assertCurrent();
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  if (options?.requireComplete && (result.errors.length > 0 || result.cancelled !== result.total)) {
    throw new Error(ORDLOCK_CANCEL_INCOMPLETE_MESSAGE);
  }
  return result;
}
