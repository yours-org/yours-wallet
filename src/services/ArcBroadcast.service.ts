import { type BroadcastResponse, type BroadcastFailure, Transaction } from '@bsv/sdk';
import { GORILLA_POOL_ARC_URL, WOC_BASE_URL } from '../utils/constants';

/**
 * Broadcast service that sends transactions via GorillaPool ARC,
 * with WoC as a fallback. Returns properly formatted BroadcastResponse/BroadcastFailure
 * compatible with @bsv/sdk expectations.
 */
export class ArcBroadcastService {
  async broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure> {
    const txHex = tx.toHex();
    console.log('Broadcasting via ARC', tx.id('hex'));

    // Try ARC first
    try {
      const response = await fetch(`${GORILLA_POOL_ARC_URL}/tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(tx.toBinary()),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.txid) {
          return { status: 'success', txid: data.txid, message: data.title || 'Broadcast successful' };
        }
      }

      // ARC returned an error — try to parse it
      let errorMsg = `ARC error ${response.status}`;
      try {
        const errData = await response.json();
        errorMsg = errData.detail || errData.title || errorMsg;
      } catch {
        // Response wasn't JSON (e.g. HTML error page) — use status text
        errorMsg = `ARC error ${response.status}: ${response.statusText}`;
      }
      console.warn('ARC broadcast failed:', errorMsg);

      // Fall through to WoC fallback
    } catch (err) {
      console.warn('ARC broadcast request failed:', err);
    }

    // Fallback: try WoC
    try {
      console.log('Falling back to WoC broadcast');
      const response = await fetch(`${WOC_BASE_URL}/tx/raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txhex: txHex }),
      });

      if (response.ok) {
        const txid = await response.json();
        if (typeof txid === 'string' && txid.length === 64) {
          return { status: 'success', txid, message: 'Broadcast successful via WoC' };
        }
      }

      let errorMsg = `WoC error ${response.status}`;
      try {
        const errText = await response.text();
        errorMsg = errText || errorMsg;
      } catch {
        // ignore
      }

      return { status: 'error', code: response.status.toString(), description: errorMsg };
    } catch (err) {
      return {
        status: 'error',
        code: 'NETWORK_ERROR',
        description: `Broadcast failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  }
}
