/**
 * Per-coin transaction history fetchers.
 *
 * Three different backends depending on the coin type:
 * - BSV:   wallet.listActions() + negative filter (exclude bsv21/origin/lock labels + baskets)
 * - BSV21: wallet.listActions({ labels: [`bsv21:<tokenId>`] }) — server-side filtered by label
 * - MNEE:  getMneeHistory.execute() — purpose-built action with rich per-tx metadata
 *
 * All three return the same `CoinTxSummary` shape so the UI stays agnostic.
 */
import { getMneeHistory, type OneSatContext } from '@1sat/actions';
import type { WalletAction } from '@bsv/sdk';
import { BSV_DECIMAL_CONVERSION } from './constants';
import { formatNumberWithCommasAndDecimals, showAmount, truncate } from './format';

/** Baskets that indicate a non-BSV action (BSV list should exclude these). */
const NON_BSV_BASKETS = new Set(['bsv21', '1sat', 'ordinals', 'lock', 'opns', 'sigma', 'bsocial', 'bap']);

/** Label prefixes/values that indicate a non-BSV action. */
const NON_BSV_LABEL_PREFIXES = ['bsv21:', 'origin:'];
const NON_BSV_LABEL_VALUES = new Set(['ordlock', 'lock', 'opns']);

export type CoinTxDirection = 'sent' | 'received' | 'transfer';

export type CoinTxSummary = {
  txid: string;
  direction: CoinTxDirection;
  amountDisplay: string;
  amountSubdued?: boolean;
  description?: string;
  counterparty?: string;
  status?: 'confirmed' | 'unconfirmed';
  height?: number;
};

export type FetchHistoryOpts = {
  offset?: number;
  limit?: number;
};

export type FetchMneeHistoryOpts = {
  fromScore?: number;
  limit?: number;
};

/** Does this wallet action look like a bsv21/ordinal/lock action rather than plain BSV? */
const isNonBsvAction = (action: WalletAction): boolean => {
  const labels = action.labels ?? [];
  for (const label of labels) {
    if (NON_BSV_LABEL_VALUES.has(label)) return true;
    for (const prefix of NON_BSV_LABEL_PREFIXES) {
      if (label.startsWith(prefix)) return true;
    }
  }
  const outputs = action.outputs ?? [];
  for (const out of outputs) {
    if (out.basket && NON_BSV_BASKETS.has(out.basket)) return true;
  }
  return false;
};

const formatBsv = (sats: number): string => {
  const bsv = sats / BSV_DECIMAL_CONVERSION;
  // Show full precision for tiny amounts, rounded for anything meaningful
  if (Math.abs(bsv) === 0) return '0 BSV';
  if (Math.abs(bsv) < 0.0001) return `${formatNumberWithCommasAndDecimals(sats, 0)} sats`;
  return `${formatNumberWithCommasAndDecimals(bsv, 8).replace(/\.?0+$/, '')} BSV`;
};

const directionFromAction = (action: WalletAction): CoinTxDirection => {
  if (action.isOutgoing) return 'sent';
  if (action.satoshis > 0) return 'received';
  return 'transfer';
};

// ─── BSV ─────────────────────────────────────────────────────────────────────

export const fetchBsvHistory = async (ctx: OneSatContext, opts: FetchHistoryOpts = {}): Promise<CoinTxSummary[]> => {
  const result = await ctx.wallet.listActions({
    labels: [],
    includeLabels: true,
    includeOutputs: true,
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  });

  // listActions returns rows in DB insertion order (oldest-first). Reverse so the
  // most recent transactions appear first.
  return result.actions
    .slice()
    .reverse()
    .filter((a) => !isNonBsvAction(a))
    .map((a) => {
      const direction = directionFromAction(a);
      const signedSats = a.satoshis; // positive = received, negative = sent (approx.)
      const absSats = Math.abs(signedSats);
      const sign = direction === 'sent' ? '-' : direction === 'received' ? '+' : '';
      return {
        txid: a.txid,
        direction,
        amountDisplay: `${sign}${formatBsv(absSats)}`,
        amountSubdued: direction === 'transfer',
        description: a.description || undefined,
      };
    });
};

// ─── BSV21 ───────────────────────────────────────────────────────────────────

/** Sum `amt:` tags on outputs tagged with `bsv21:<tokenId>` (i.e. outputs owned by us). */
const sumOwnBsv21Outputs = (action: WalletAction, tokenId: string): bigint => {
  let total = 0n;
  for (const out of action.outputs ?? []) {
    const tags = out.tags ?? [];
    if (!tags.some((t) => t === `bsv21:${tokenId}`)) continue;
    const amtTag = tags.find((t) => t.startsWith('amt:'));
    if (!amtTag) continue;
    try {
      total += BigInt(amtTag.slice(4));
    } catch {
      /* malformed */
    }
  }
  return total;
};

/** Sum `amt:` tags on inputs that reference a bsv21 output of this tokenId. */
const sumOwnBsv21Inputs = (action: WalletAction, tokenId: string): bigint => {
  let total = 0n;
  for (const input of action.inputs ?? []) {
    // WalletActionInput doesn't expose tags, but we can often infer via the source
    // locking script when `includeInputSourceLockingScripts: true`. Fallback below
    // uses `sourceSatoshis` which for bsv21 outputs is always 1 (not useful for
    // amount calc). We rely on the caller to set `includeInputs: true` and may
    // accept imperfect results when inputs lack structured data.
    // Most reliable cue: `inputDescription` on sendBsv21 inputs isn't standardized,
    // so we fall through unless we later have tag data.
    void input;
    void tokenId;
  }
  return total;
};

/**
 * Compute the token amount delta for the user in this action.
 *
 * For RECEIVE (not outgoing): sum own bsv21 outputs → the amount received.
 * For SEND (outgoing): we want `amount sent to others`, not `total moved`.
 *   The action's `outputs` returned by listActions includes OUR own outputs (change)
 *   with bsv21 tags — external recipient outputs have no tags. But the
 *   `outputDescription` on recipient outputs is `"Send <amt> tokens"`, so we can
 *   parse that out as a fallback.
 */
const bsv21AmountFromAction = (action: WalletAction, tokenId: string): bigint => {
  if (!action.isOutgoing) {
    // Receive: sum what we got.
    return sumOwnBsv21Outputs(action, tokenId);
  }

  // Send: try to parse recipient amounts from outputDescription first.
  let recipientTotal = 0n;
  let foundDescription = false;
  const outputs = action.outputs ?? [];
  for (const out of outputs) {
    const tags = out.tags ?? [];
    // Skip our own outputs (they have bsv21 tags for this tokenId = they're change).
    if (tags.some((t) => t === `bsv21:${tokenId}`)) continue;
    const match = out.outputDescription?.match(/^Send\s+(\d+)\s+tokens?$/i);
    if (!match) continue;
    foundDescription = true;
    try {
      recipientTotal += BigInt(match[1]);
    } catch {
      /* ignore */
    }
  }

  if (foundDescription) return recipientTotal;

  // Fallback: approximate via inputs - change. Inputs don't have tags so this is
  // best-effort; otherwise just return the change amount as a conservative "moved"
  // value (better under-report than double-count). Returning 0n tells the UI to
  // show "{sym} transfer" without a number.
  void sumOwnBsv21Inputs;
  return 0n;
};

/** Binary direction for token actions: either we sent or we received. */
const tokenDirectionFromAction = (action: WalletAction): CoinTxDirection => (action.isOutgoing ? 'sent' : 'received');

export const fetchBsv21History = async (
  ctx: OneSatContext,
  tokenId: string,
  decimals: number,
  symbol: string | undefined,
  opts: FetchHistoryOpts = {},
): Promise<CoinTxSummary[]> => {
  const result = await ctx.wallet.listActions({
    labels: [`bsv21:${tokenId}`],
    labelQueryMode: 'all',
    includeLabels: true,
    includeOutputs: true,
    includeInputs: true,
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  });

  const sym = symbol || 'Token';

  // Reverse insertion order so newest is first.
  return result.actions
    .slice()
    .reverse()
    .map((a) => {
      const direction = tokenDirectionFromAction(a);
      const atomic = bsv21AmountFromAction(a, tokenId);
      const sign = direction === 'sent' ? '-' : '+';
      const display = atomic > 0n ? `${sign}${showAmount(atomic, decimals)} ${sym}` : `${sym} transfer`;
      return {
        txid: a.txid,
        direction,
        amountDisplay: display,
        amountSubdued: atomic === 0n,
        description: a.description || undefined,
      };
    });
};

// ─── MNEE ────────────────────────────────────────────────────────────────────

const MNEE_DECIMALS = 5;

export const fetchMneeHistory = async (
  ctx: OneSatContext,
  addresses: string[],
  opts: FetchMneeHistoryOpts = {},
): Promise<CoinTxSummary[]> => {
  if (!addresses.length) return [];
  const result = await getMneeHistory.execute(ctx, {
    addresses,
    limit: opts.limit ?? 50,
    fromScore: opts.fromScore,
  });

  // Sort by score descending → newest first. (The API usually returns them this way
  // already, but sorting explicitly makes ordering independent of backend behavior.)
  return result.history
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((h) => {
      const direction: CoinTxDirection = h.type === 'send' ? 'sent' : 'received';
      const sign = direction === 'sent' ? '-' : '+';
      const amountDecimal = h.amount / 10 ** MNEE_DECIMALS;
      const precision = Math.abs(amountDecimal) >= 0.01 ? 2 : MNEE_DECIMALS;
      const amountDisplay = `${sign}${formatNumberWithCommasAndDecimals(amountDecimal, precision)} MNEE`;

      // Pick a reasonable counterparty label (first one, truncated)
      const counterparty = h.counterparties[0]?.address;

      return {
        txid: h.txid,
        direction,
        amountDisplay,
        status: h.status,
        height: h.height,
        counterparty,
        description: counterparty
          ? `${direction === 'sent' ? 'to' : 'from'} ${truncate(counterparty, 6, 4)}`
          : undefined,
      };
    });
};
