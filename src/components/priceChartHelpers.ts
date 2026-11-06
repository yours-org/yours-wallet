/**
 * Pure pieces of the token price chart: the ranges and their candle
 * resolution, the SVG path math, the change over a range and price text.
 */
import type { SwapCandle, SwapCandleTf } from '../services/swapTypes';

export type ChartRangeKey = '1H' | '1D' | '1W' | '1M' | 'ALL';
export type ChartCurrency = 'USD' | 'BSV';

export type ChartRange = { key: ChartRangeKey; label: string; tf: SwapCandleTf; spanMs: number };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Each range reads candles fine enough for ~60 to 180 points. */
export const CHART_RANGES: ChartRange[] = [
  { key: '1H', label: '1H', tf: '1m', spanMs: HOUR },
  { key: '1D', label: '1D', tf: '15m', spanMs: DAY },
  { key: '1W', label: '1W', tf: '1h', spanMs: 7 * DAY },
  { key: '1M', label: '1M', tf: '4h', spanMs: 30 * DAY },
  { key: 'ALL', label: 'All', tf: '1d', spanMs: 365 * DAY },
];

export const rangeOf = (key: ChartRangeKey): ChartRange => CHART_RANGES.find((r) => r.key === key) ?? CHART_RANGES[1];

/** The next wider range, for a window with too few trades to draw; undefined past the widest. */
export const widerRange = (key: ChartRangeKey): ChartRangeKey | undefined => {
  const i = CHART_RANGES.findIndex((r) => r.key === key);
  return i >= 0 && i < CHART_RANGES.length - 1 ? CHART_RANGES[i + 1].key : undefined;
};

export type ChartPoint = { x: number; y: number; t: number; value: number };

/**
 * Lay candle closes (any unit) out in a `w`×`h` box with `pad` px above and
 * below the extremes. A flat series sits on the middle line.
 */
export const layoutPoints = (candles: SwapCandle[], w: number, h: number, pad = 8): ChartPoint[] => {
  if (candles.length === 0) return [];
  const values = candles.map((c) => c.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const t0 = candles[0].t;
  const t1 = candles[candles.length - 1].t;
  const tSpan = t1 - t0;
  return candles.map((c, i) => ({
    x: tSpan > 0 ? ((c.t - t0) / tSpan) * w : candles.length > 1 ? (i / (candles.length - 1)) * w : w / 2,
    y: span > 0 ? pad + (1 - (c.close - min) / span) * (h - 2 * pad) : h / 2,
    t: c.t,
    value: c.close,
  }));
};

const px = (n: number) => Math.round(n * 100) / 100;

/** The line and the filled area under it, as SVG path data. */
export const linePaths = (points: ChartPoint[], h: number): { line: string; area: string } => {
  if (points.length === 0) return { line: '', area: '' };
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x)},${px(p.y)}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const area = `${line} L${px(last.x)},${h} L${px(first.x)},${h} Z`;
  return { line, area };
};

/** The point nearest to an x position (a scrub). */
export const nearestPoint = (points: ChartPoint[], x: number): ChartPoint | undefined => {
  let best: ChartPoint | undefined;
  for (const p of points) if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  return best;
};

/** Change from the first to the last close, percent; null with fewer than two points. */
export const changePct = (candles: SwapCandle[]): number | null => {
  if (candles.length < 2) return null;
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  return first > 0 ? ((last - first) / first) * 100 : null;
};

/** Sats per whole token as the chosen currency's number: BSV, or USD at `bsvUsdRate`. */
export const priceIn = (satsPerToken: number, currency: ChartCurrency, bsvUsdRate: number): number =>
  currency === 'BSV' ? satsPerToken / 1e8 : (satsPerToken / 1e8) * bsvUsdRate;

/**
 * A price for reading: dollars with 2 places from $1, else the first 3
 * significant decimals; BSV with up to 8 places, trailing zeros dropped.
 */
export const formatPrice = (value: number, currency: ChartCurrency): string => {
  if (!Number.isFinite(value) || value <= 0) return currency === 'USD' ? '$0.00' : '0 BSV';
  if (currency === 'USD') {
    if (value >= 1)
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const digits = Math.min(14, Math.max(2, -Math.floor(Math.log10(value)) + 2));
    const plain = value.toFixed(digits).replace(/0+$/, '');
    // Sub-cent prices: fold the run of zeros into a subscript count ($0.0₄123), as Phantom does.
    const m = /^0\.(0{4,})(\d+)$/.exec(plain);
    if (m) return `$0.0${subscriptDigits(m[1].length)}${m[2].slice(0, 3)}`;
    return `$${plain}`;
  }
  const text =
    value >= 1
      ? value.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  return `${text} BSV`;
};

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const subscriptDigits = (n: number): string =>
  String(n)
    .split('')
    .map((d) => SUBSCRIPTS[Number(d)])
    .join('');

export const formatChange = (pct: number | null): string =>
  pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(Math.abs(pct) >= 10 ? 1 : 2)}%`;

/** When the scrubbed point happened, relative to the range: time of day inside a day, else a short date. */
export const formatPointTime = (t: number, range: ChartRangeKey, now = Date.now()): string => {
  const d = new Date(t);
  if (range === '1H' || range === '1D') {
    const sameDay = new Date(now).toDateString() === d.toDateString();
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return sameDay ? `Today ${time}` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
