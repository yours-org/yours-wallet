import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../hooks/useTheme';
import { Skeleton } from './Skeleton';
import { swapCandles } from '../services/swap';
import type { SwapCandle } from '../services/swapTypes';
import {
  CHART_RANGES,
  changePct,
  formatChange,
  formatPointTime,
  formatPrice,
  layoutPoints,
  linePaths,
  nearestPoint,
  priceIn,
  rangeOf,
  widerRange,
  type ChartCurrency,
  type ChartPoint,
  type ChartRangeKey,
} from './priceChartHelpers';

export type PriceChartProps = {
  tokenId: string;
  ticker: string;
  dec: number;
  /** USD per BSV. */
  bsvUsdRate: number;
  /** The price now, sats per whole token, shown until candles arrive and when a range has none. */
  currentSatsPerToken: number | null;
};

const W = 360;
const H = 140;
const GREEN = '#34D399';
const CURRENCIES: ChartCurrency[] = ['USD', 'BSV'];
const RANGE_WORDS: Record<ChartRangeKey, string> = {
  '1H': 'past hour',
  '1D': 'past 24 hours',
  '1W': 'past week',
  '1M': 'past month',
  ALL: 'all time',
};

type Loaded = { range: ChartRangeKey; candles: SwapCandle[]; widenedFrom?: ChartRangeKey };

/**
 * A token's price over a range: the price and its change up top, a line
 * with a soft fill, a scrub tooltip, range pills, and a USD / BSV switch.
 * Candles come from the exchange through the background (`swapCandles`).
 */
export const PriceChart = ({ tokenId, ticker, dec, bsvUsdRate, currentSatsPerToken }: PriceChartProps) => {
  const { theme } = useTheme();
  const gray = theme.color.global.gray;
  const contrast = theme.color.global.contrast;
  const row = theme.color.global.row;
  const red = theme.color.component.snackbarError;
  const accent = theme.color.component.primaryButtonLeftGradient;
  const accentRight = theme.color.component.primaryButtonRightGradient;
  const primaryGradient = `linear-gradient(135deg, ${accent}, ${accentRight})`;

  const [range, setRange] = useState<ChartRangeKey>('1D');
  const [currency, setCurrency] = useState<ChartCurrency>(bsvUsdRate > 0 ? 'USD' : 'BSV');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const cache = useRef(new Map<ChartRangeKey, SwapCandle[]>());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setScrub(null);
    const read = async (key: ChartRangeKey): Promise<SwapCandle[]> => {
      const hit = cache.current.get(key);
      if (hit) return hit;
      const r = rangeOf(key);
      const to = Date.now();
      const rows = await swapCandles(tokenId, dec, r.tf, to - r.spanMs, to);
      cache.current.set(key, rows);
      return rows;
    };
    (async () => {
      try {
        // A window with fewer than two trades has nothing to draw: widen until one does.
        let key: ChartRangeKey = range;
        let rows = await read(key);
        let widenedFrom: ChartRangeKey | undefined;
        while (rows.length < 2) {
          const next = widerRange(key);
          if (!next) break;
          widenedFrom ??= range;
          key = next;
          rows = await read(key);
        }
        if (!cancelled) setLoaded({ range: key, candles: rows, widenedFrom });
      } catch (err) {
        console.warn('[PriceChart] candles failed:', err);
        if (!cancelled) {
          setFailed(true);
          setLoaded(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId, dec, range]);

  const candles = loaded?.candles ?? [];
  const points = useMemo(() => layoutPoints(candles, W, H), [candles]);
  const paths = useMemo(() => linePaths(points, H), [points]);
  const change = changePct(candles);
  const up = change === null || change >= 0;
  const lineColor = up ? GREEN : red;

  const lastSats = candles.length ? candles[candles.length - 1].close : (currentSatsPerToken ?? 0);
  const shownSats = scrub ? scrub.value : lastSats;
  const other: ChartCurrency = currency === 'USD' ? 'BSV' : 'USD';
  const shownRange = loaded?.range ?? range;

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    setScrub(nearestPoint(points, x) ?? null);
  };

  const tooltipLeft = scrub ? Math.min(Math.max(scrub.x - 60, 0), W - 120) : 0;

  return (
    <div className="flex flex-col w-full">
      {/* Price header with the currency switch */}
      <div className="flex items-start justify-between px-4">
        <div className="flex flex-col min-w-0">
          <span className="text-xs" style={{ color: gray }}>
            {scrub ? formatPointTime(scrub.t, shownRange) : 'Price'}
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            {loading && candles.length === 0 && shownSats === 0 ? (
              <Skeleton className="h-7 w-36 rounded-md my-0.5" />
            ) : (
              <span
                className="text-[24px] font-bold leading-tight"
                style={{ color: contrast, letterSpacing: '-0.02em' }}
              >
                {formatPrice(priceIn(shownSats, currency, bsvUsdRate), currency)}
              </span>
            )}
            {!scrub && (
              <span className="text-[13px] font-semibold" style={{ color: change === null ? gray : up ? GREEN : red }}>
                {formatChange(change)}
              </span>
            )}
          </div>
          <span className="text-xs" style={{ color: gray }}>
            {bsvUsdRate > 0 ? `≈ ${formatPrice(priceIn(shownSats, other, bsvUsdRate), other)} · ` : ''}
            {scrub ? `per ${ticker}` : RANGE_WORDS[shownRange]}
          </span>
        </div>
        <div
          role="group"
          aria-label="Price currency"
          className="flex items-center rounded-full p-0.5 flex-shrink-0 mt-1"
          style={{ background: row, border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {CURRENCIES.map((c) => {
            const on = c === currency;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                disabled={c === 'USD' && bsvUsdRate <= 0}
                onClick={() => setCurrency(c)}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold border-0 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: on ? primaryGradient : 'transparent',
                  color: on ? theme.color.component.primaryButtonText : gray,
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* The chart */}
      <div className="relative w-full mt-2" style={{ height: H }}>
        {loading && candles.length === 0 ? (
          <div className="absolute inset-0 flex flex-col justify-end px-4 pb-3" aria-hidden>
            {/* A faint wave stands in for the line until the candles arrive */}
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-full">
              <motion.path
                d="M0,100 C40,92 60,112 100,98 S160,70 200,78 S260,52 300,58 S340,38 360,42"
                fill="none"
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            </svg>
          </div>
        ) : failed || candles.length < 2 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <span className="text-xs text-center" style={{ color: gray }}>
              {failed
                ? 'Could not load the price history.'
                : `No trades yet, so there is no ${ticker} price history to chart.`}
            </span>
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              role="img"
              aria-label={`${ticker} price, ${RANGE_WORDS[shownRange]}, ${up ? 'up' : 'down'} ${formatChange(change)}`}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="block w-full h-full touch-none"
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={() => setScrub(null)}
              onPointerUp={() => setScrub(null)}
            >
              <defs>
                <linearGradient id={`fill-${tokenId.slice(0, 8)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Keyed by range so a new window draws itself in again */}
              <motion.path
                key={`area-${shownRange}`}
                d={paths.area}
                fill={`url(#fill-${tokenId.slice(0, 8)})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              />
              <motion.path
                key={`line-${shownRange}`}
                d={paths.line}
                fill="none"
                stroke={lineColor}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0, opacity: 0.6 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
              {scrub && (
                <>
                  <line x1={scrub.x} y1={0} x2={scrub.x} y2={H} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
                  <circle
                    cx={scrub.x}
                    cy={scrub.y}
                    r={4}
                    fill={theme.color.global.walletBackground}
                    stroke={lineColor}
                    strokeWidth={2}
                  />
                </>
              )}
            </svg>
            {scrub && (
              <div
                className="absolute top-2 flex flex-col px-2 py-1.5 rounded-lg text-[10px] leading-snug pointer-events-none"
                style={{
                  left: `${(tooltipLeft / W) * 100}%`,
                  background: row,
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span className="font-semibold" style={{ color: contrast }}>
                  {formatPrice(priceIn(scrub.value, currency, bsvUsdRate), currency)}
                </span>
                <span style={{ color: gray }}>{formatPointTime(scrub.t, shownRange)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Range pills */}
      <div className="flex items-center justify-center gap-1.5 mt-2 px-4">
        {CHART_RANGES.map((r) => {
          const on = r.key === range;
          return (
            <motion.button
              key={r.key}
              type="button"
              aria-pressed={on}
              whileTap={{ scale: 0.95 }}
              onClick={() => setRange(r.key)}
              className="px-3 py-1 rounded-full text-[11px] font-semibold outline-none cursor-pointer"
              style={{
                background: on ? primaryGradient : row,
                color: on ? theme.color.component.primaryButtonText : gray,
                border: on ? 'none' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {r.label}
            </motion.button>
          );
        })}
      </div>
      {loaded?.widenedFrom && (
        <span className="text-[10px] text-center mt-1.5 px-4" style={{ color: gray }}>
          Too few trades in the {RANGE_WORDS[loaded.widenedFrom]}; showing the {RANGE_WORDS[loaded.range]}.
        </span>
      )}
    </div>
  );
};
