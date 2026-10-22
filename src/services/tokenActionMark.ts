/**
 * One prompt per token action.
 *
 * A dApp createAction that carries a BRC-207 `p color ...` label is signed
 * through the color module, which always asks the user (requestTokenAccess at
 * signAction) with the real inputs, outputs and fee. The toolbox asks for a
 * spending authorization before that, which is a second popup for the same
 * action. While such a createAction is in flight for an originator, the
 * background answers that originator's spending authorization ephemerally and
 * lets the color consent be the only prompt.
 *
 * The mark is per originator and counted, so nested or concurrent token
 * actions from one origin keep it until the last one finishes. Known
 * imprecision: a plain BSV createAction from the same origin running at the
 * same time as a token action is also auto-granted.
 */

import type { CreateActionArgs } from '@bsv/sdk';

const COLOR_LABEL_PREFIX = 'p color ';

/** Same rule as WalletPermissionsManager.normalizeOriginator: lowercase hostname, no scheme or port. */
export const normalizeTokenOriginator = (originator?: string): string => {
  if (!originator) return '';
  const trimmed = originator.trim();
  if (!trimmed) return '';
  try {
    const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(candidate);
    if (!url.hostname) return trimmed.toLowerCase();
    const hostname = url.hostname.toLowerCase();
    return hostname.includes(':') ? `[${hostname}]` : hostname;
  } catch {
    return trimmed.toLowerCase();
  }
};

/** True when the createAction carries a BRC-207 (`p color ...`) label. */
export const isColorAction = (params?: Pick<CreateActionArgs, 'labels'>): boolean =>
  params?.labels?.some((label) => typeof label === 'string' && label.startsWith(COLOR_LABEL_PREFIX)) === true;

export class TokenActionMarks {
  private counts = new Map<string, number>();

  /** Runs `fn` with the originator marked when `params` is a token action; unmarks in finally. */
  async run<T>(originator: string | undefined, params: Pick<CreateActionArgs, 'labels'>, fn: () => Promise<T>): Promise<T> {
    const key = normalizeTokenOriginator(originator);
    if (!key || !isColorAction(params)) return await fn();
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    try {
      return await fn();
    } finally {
      const left = (this.counts.get(key) ?? 1) - 1;
      if (left > 0) this.counts.set(key, left);
      else this.counts.delete(key);
    }
  }

  /** Whether a spending request from `originator` falls inside an in-flight token action. */
  has(originator?: string): boolean {
    const key = normalizeTokenOriginator(originator);
    return !!key && (this.counts.get(key) ?? 0) > 0;
  }
}
