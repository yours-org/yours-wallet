/**
 * Pure helpers for SwapView: amount parsing in base units (string math, no
 * floats), rate and fee text, and the exchange's error wording.
 */

export type ParsedAmount = { ok: true; value: string } | { ok: false; reason: 'empty' | 'invalid' | 'decimals' };

/**
 * A typed decimal amount as a base-unit string. Rejects non-numeric input and
 * more decimal places than `dec`; leading zeros are dropped.
 */
export const parseAmount = (input: string, dec: number): ParsedAmount => {
  const text = input.trim();
  if (text === '' || text === '.') return { ok: false, reason: 'empty' };
  if (!/^\d*\.?\d*$/.test(text)) return { ok: false, reason: 'invalid' };
  const [whole = '', frac = ''] = text.split('.');
  if (frac.length > dec) return { ok: false, reason: 'decimals' };
  const digits = `${whole}${frac.padEnd(dec, '0')}`.replace(/^0+/, '');
  return { ok: true, value: digits === '' ? '0' : digits };
};

/** Whether a keystroke leaves the field in a state worth keeping (partial input like "1." is fine). */
export const acceptsAmountInput = (input: string, dec: number): boolean => {
  if (input === '') return true;
  if (!/^\d*\.?\d*$/.test(input)) return false;
  const parts = input.split('.');
  if (parts.length === 2 && parts[1].length > dec) return false;
  if (parts.length === 2 && dec === 0) return false;
  return true;
};

/** Whole tokens one BSV buys at `effectivePrice` (sats per whole token). */
export const tokensPerBsv = (effectivePrice: number): number =>
  effectivePrice > 0 && Number.isFinite(effectivePrice) ? 1e8 / effectivePrice : 0;

/** A rate for display: up to 6 significant digits, thousands separators. */
export const formatRate = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '0';
  return new Intl.NumberFormat('en-US', n >= 1 ? { maximumFractionDigits: 4 } : { maximumSignificantDigits: 6 }).format(
    n,
  );
};

/** Basis points as percent text: 30 → "0.3", 100 → "1", 125 → "1.25". */
export const bpsToPercentText = (bps: number): string => {
  if (!Number.isFinite(bps)) return '0';
  return String(Math.round(bps) / 100);
};

/** `abc12345…6789` for a txid or outpoint. */
export const shortOutpoint = (s: string): string => (s.length <= 14 ? s : `${s.slice(0, 8)}…${s.slice(-4)}`);

/** Balance minus a fee cushion, never below 0. */
export const subtractCushion = (balance: bigint, cushion: bigint): bigint =>
  balance > cushion ? balance - cushion : 0n;

/** Swap failure text, worded as the exchange's own app words it. */
export const swapErrorText = (kind: string | undefined, message: string | undefined): string => {
  switch (kind) {
    case 'user_rejected':
      return 'You declined the request in your wallet.';
    case 'pool_spent':
    case 'stale_pool':
    case 'quote_mismatch':
      return 'The price moved while your swap was being prepared, so it was not sent. Try again for a fresh quote.';
    case 'slippage':
      return 'The swap would end up outside your slippage setting. Raise it or try a smaller amount.';
    case 'below_minimum':
      return 'This amount is below the smallest trade the pool accepts. Try a larger amount.';
    case 'no_answer':
      return 'The exchange did not answer. Your funds are still held for the swap; recovery takes them in, so check your wallet in a moment.';
    default:
      return message || 'The swap failed.';
  }
};
