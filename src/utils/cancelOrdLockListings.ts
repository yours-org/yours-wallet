/**
 * ORDLOCK transition helper — cancel wallet-owned OrdLock listings and recover
 * the ordinals into the wallet. Shared by OrdWallet load/refresh and BSV
 * sweep/send-all paths (OPL-4696).
 *
 * Create of new OrdLock listings is disabled elsewhere (ORDLOCK_LISTING_DISABLED).
 * Buy of others' listings and manual cancel stay enabled.
 */
import type { WalletOutput } from '@bsv/sdk';
import { cancelOrdinalListing, listOrdinals, type OneSatContext } from '@1sat/actions';
import { readAssetIdTag } from '@1sat/types';

export const ORDLOCK_LISTING_DISABLED_MESSAGE =
  'OrdLock listing creation is deprecated pending a replacement contract. Existing listings can still be cancelled or bought.';

const ORDLOCK_TAG = 'ordlock';

/** Sessions that already ran auto-cancel (avoids re-cancel spam on re-render). */
const ranSessions = new Set<string>();

export type CancelOrdLockResult = {
  attempted: number;
  cancelled: number;
  skipped: number;
  errors: string[];
};

export function isOrdLockListed(output: WalletOutput): boolean {
  return output.tags?.includes(ORDLOCK_TAG) ?? false;
}

function trackingId(output: WalletOutput): string | undefined {
  return readAssetIdTag(output.tags);
}

/**
 * Cancel OrdLock-listed outputs the wallet controls.
 * Fail soft: logs and collects errors; never throws for individual cancel failures.
 *
 * @param sessionKey When set, only runs once per key for this JS realm (e.g. per unlock/load).
 *                   Pass a stable id like identity address + 'ord-load' or 'bsv-sweep'.
 */
export async function cancelOwnedOrdLockListings(
  apiContext: OneSatContext,
  options?: {
    /** Pre-fetched outputs; when omitted, lists ordinals from the wallet. */
    outputs?: WalletOutput[];
    /** Dedup key — skip if this session already ran. */
    sessionKey?: string;
    /** Force run even if sessionKey already executed. */
    force?: boolean;
    /** Max listings to cancel in one pass (default 25). */
    limit?: number;
  },
): Promise<CancelOrdLockResult> {
  const result: CancelOrdLockResult = { attempted: 0, cancelled: 0, skipped: 0, errors: [] };

  const sessionKey = options?.sessionKey;
  if (sessionKey && !options?.force && ranSessions.has(sessionKey)) {
    return result;
  }
  if (sessionKey) ranSessions.add(sessionKey);

  try {
    let outputs = options?.outputs;
    if (!outputs) {
      const { outputs: listed } = await listOrdinals.execute(apiContext, {
        limit: options?.limit ?? 100,
        offset: 0,
      });
      outputs = listed;
    }

    const listed = outputs.filter(isOrdLockListed);
    if (listed.length === 0) return result;

    const cap = options?.limit ?? 25;
    const toCancel = listed.slice(0, cap);

    for (const output of toCancel) {
      const id = trackingId(output);
      if (!id) {
        result.skipped += 1;
        console.warn(
          '[cancelOwnedOrdLockListings] listed output missing tracking id, skipping',
          output.outpoint,
        );
        continue;
      }

      result.attempted += 1;
      try {
        const cancelRes = await cancelOrdinalListing.execute(apiContext, { id });
        if (!cancelRes.txid || cancelRes.error) {
          const msg = cancelRes.error ?? 'cancel-failed';
          result.errors.push(`${output.outpoint}: ${msg}`);
          console.warn('[cancelOwnedOrdLockListings] cancel failed', output.outpoint, msg);
          continue;
        }
        result.cancelled += 1;
        console.log('[cancelOwnedOrdLockListings] cancelled', output.outpoint, cancelRes.txid);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${output.outpoint}: ${msg}`);
        console.warn('[cancelOwnedOrdLockListings] cancel exception', output.outpoint, err);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    console.warn('[cancelOwnedOrdLockListings] session failed', err);
  }

  return result;
}

/** Test/helper: clear session dedup (not used in production UI). */
export function resetOrdLockCancelSessions(): void {
  ranSessions.clear();
}
