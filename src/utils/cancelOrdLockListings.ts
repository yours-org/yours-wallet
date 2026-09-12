/** Owner cancel for marketplace listings (OrdLock v1 and v2). */
import type { WalletOutput } from '@bsv/sdk';
import {
  cancelOrdinalListing,
  cancelOpnsListing,
  cancelTokenListing,
  listOrdinals,
  listOpns,
  type OneSatContext,
} from '@1sat/actions';
import { ORDLOCK_V2_TAG, readAssetIdTag, TOKEN_CONTENT_TYPE } from '@1sat/types';
import { pinCwiToIdentity } from './accountBoundWallet';

// `@1sat/types` exports the v2 tag only, so the v1 tag stays a local const.
export const ORDLOCK_TAG = 'ordlock';
export const LISTING_TAGS = [ORDLOCK_TAG, ORDLOCK_V2_TAG];

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
  txids: string[];
  errors: string[];
};

export function isOrdLockListed(output: WalletOutput): boolean {
  const tags = output.tags ?? [];
  return tags.includes(ORDLOCK_TAG) || tags.includes(ORDLOCK_V2_TAG);
}

function isTokenListing(output: WalletOutput): boolean {
  const tags = output.tags ?? [];
  if (tags.includes(`type:${TOKEN_CONTENT_TYPE}`)) return true;
  return tags.some((tag) => tag.startsWith('bsv21:') && tag !== 'bsv21:deploy' && tag !== 'bsv21:auth');
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
    /** Manual selections default to the Ordinals view's basket. */
    basket?: '1sat' | 'opns';
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
    txids: [],
    errors: [],
  };
  const progress = () => {
    const { total, attempted, cancelled, skipped } = result;
    options?.onProgress?.({ total, attempted, cancelled, skipped });
  };

  try {
    const context = await pinCwiToIdentity(apiContext, options?.signal);
    const assertCurrent = async () => {
      options?.signal?.throwIfAborted();
      await context.wallet.getPublicKey({ identityKey: true });
      options?.signal?.throwIfAborted();
    };
    const outputs = new Map<
      string,
      {
        output: WalletOutput;
        cancel: typeof cancelOrdinalListing | typeof cancelOpnsListing | typeof cancelTokenListing;
      }
    >();
    if (options?.outputs) {
      const cancel = options.basket === 'opns' ? cancelOpnsListing : cancelOrdinalListing;
      for (const output of options.outputs) outputs.set(output.outpoint, { output, cancel });
    } else {
      // Keep native basket queries and per-output actions so callers retain live
      // progress and confirmed outpoints for manual retries.
      for (const { list, cancel } of [
        { list: listOrdinals, cancel: cancelOrdinalListing },
        { list: listOpns, cancel: cancelOpnsListing },
      ]) {
        const basketOutputs = new Map<string, WalletOutput>();
        let offset = 0;
        let total: number | undefined;
        while (true) {
          await assertCurrent();
          const page = await list.execute(context, {
            tags: LISTING_TAGS,
            tagQueryMode: 'any',
            limit: total === undefined ? 100 : Math.min(100, total - offset),
            offset,
          });
          await assertCurrent();
          if (page.totalOutputs !== undefined) {
            if (
              !Number.isSafeInteger(page.totalOutputs) ||
              page.totalOutputs < 0 ||
              offset + page.outputs.length > page.totalOutputs
            )
              throw new Error('Listing discovery returned an invalid total.');
            if (total !== undefined && total !== page.totalOutputs)
              throw new Error('Listing inventory changed. Retry delisting.');
            total = page.totalOutputs;
          }
          if (page.outputs.length === 0) {
            if (total !== undefined && offset < total)
              throw new Error('Listing discovery ended before all outputs were returned.');
            break;
          }
          const previousSize = basketOutputs.size;
          for (const output of page.outputs) basketOutputs.set(output.outpoint, output);
          if (basketOutputs.size === previousSize)
            throw new Error('Listing discovery did not advance. Retry delisting.');
          offset += page.outputs.length;
          if (total !== undefined && offset >= total) {
            if (basketOutputs.size < total) throw new Error('Listing discovery returned an incomplete snapshot.');
            break;
          }
        }
        for (const output of basketOutputs.values()) {
          if (outputs.has(output.outpoint)) throw new Error('Listing appeared in multiple baskets. Retry delisting.');
          outputs.set(output.outpoint, { output, cancel });
        }
      }
    }

    const listings = [...outputs.values()].filter(({ output }) => isOrdLockListed(output));
    result.total = listings.length;
    progress();
    for (const { output, cancel } of listings) {
      await assertCurrent();
      const id = readAssetIdTag(output.tags);
      if (!id) {
        result.skipped += 1;
        result.errors.push(`${output.outpoint}: missing tracking id`);
        progress();
        continue;
      }

      // Token listings must always cancel as transfers, never as NFTs,
      // regardless of which basket discovered them.
      const action = isTokenListing(output) ? cancelTokenListing : cancel;

      result.attempted += 1;
      try {
        const cancellation = await action.execute(context, { id });
        if (cancellation.txid?.trim()) result.txids.push(cancellation.txid.trim());
        await assertCurrent();
        if (!cancellation.txid?.trim() || cancellation.error) {
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
