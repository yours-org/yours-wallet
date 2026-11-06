import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useServiceContext } from '../hooks/useServiceContext';
import { useIntersectionObserver } from '../hooks/useIntersectObserver';
import { useTheme } from '../hooks/useTheme';
import { explorerTxUrl } from '../utils/constants';
import { fetchBsv21History, fetchBsvHistory, fetchOneColorHistory, type CoinTxSummary } from '../utils/coinHistory';
import { truncate } from '../utils/format';
import { Show } from './Show';
import { AssetRowSkeleton } from './Skeleton';

export type CoinHistoryFilter =
  | { type: 'bsv' }
  | { type: 'bsv21'; tokenId: string; decimals: number; symbol?: string }
  | { type: '1color'; assetId: string; decimals: number; symbol?: string };

export type CoinHistoryProps = {
  filter: CoinHistoryFilter;
  /** The section label. */
  title?: string;
  pageSize?: number;
  /** Bump to force a refetch (e.g. after a successful send). */
  refreshKey?: number | string;
};

const filterKey = (filter: CoinHistoryFilter): string => {
  switch (filter.type) {
    case 'bsv':
      return 'bsv';
    case 'bsv21':
      return `bsv21:${filter.tokenId}`;
    case '1color':
      return `1color:${filter.assetId}`;
  }
};

export const CoinHistory = ({ filter, pageSize = 25, refreshKey, title = 'Recent activity' }: CoinHistoryProps) => {
  const { apiContext, chromeStorageService } = useServiceContext();
  const { theme } = useTheme();
  const [items, setItems] = useState<CoinTxSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);
  const { isIntersecting, elementRef: sentinelRef } = useIntersectionObserver({
    rootMargin: '120px',
  });

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const row = theme.color.global.row;
  const accent = theme.color.component.primaryButtonLeftGradient;

  const fetchPage = useCallback(
    async (offset: number): Promise<CoinTxSummary[]> => {
      switch (filter.type) {
        case 'bsv':
          return fetchBsvHistory(apiContext, { offset, limit: pageSize });
        case 'bsv21':
          return fetchBsv21History(apiContext, filter.tokenId, filter.decimals, filter.symbol, {
            offset,
            limit: pageSize,
          });
        case '1color':
          return fetchOneColorHistory(apiContext, filter.assetId, filter.decimals, filter.symbol, {
            offset,
            limit: pageSize,
          });
      }
    },
    [apiContext, filter, pageSize],
  );

  // Initial / refresh fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    offsetRef.current = 0;

    fetchPage(0)
      .then((page) => {
        if (cancelled) return;
        setItems(page);
        setHasMore(page.length === pageSize);
        offsetRef.current = page.length;
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('[CoinHistory] Failed to load:', e);
        setError(e instanceof Error ? e.message : 'Failed to load activity');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey(filter), refreshKey]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(offsetRef.current);
      setItems((prev) => [...prev, ...next]);
      setHasMore(next.length === pageSize);
      offsetRef.current += next.length;
    } catch (e) {
      console.error('[CoinHistory] Load more failed:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loadingMore, pageSize]);

  // Auto-fetch the next page whenever the sentinel scrolls into view.
  useEffect(() => {
    if (isIntersecting && !loading && !loadingMore && hasMore && !error) {
      handleLoadMore();
    }
  }, [isIntersecting, loading, loadingMore, hasMore, error, handleLoadMore]);

  const openInExplorer = (txid: string) => window.open(explorerTxUrl(txid, apiContext.chain), '_blank');

  /** Money in (received, a swap that paid out) reads in the accent; money out in gray. */
  const inbound = (item: CoinTxSummary): boolean =>
    item.kind === 'swap' ? item.amountDisplay.startsWith('+') : item.direction === 'received';

  const directionIcon = (item: CoinTxSummary) => {
    const color = inbound(item) ? accent : gray;
    if (item.kind === 'swap') return <ArrowLeftRight size={12} strokeWidth={2.5} style={{ color }} />;
    switch (item.direction) {
      case 'received':
        return <ArrowDownLeft size={12} strokeWidth={2.5} style={{ color }} />;
      case 'sent':
        return <ArrowUpRight size={12} strokeWidth={2.5} style={{ color }} />;
      default:
        return <ArrowLeftRight size={12} strokeWidth={2.5} style={{ color }} />;
    }
  };

  const amountColor = (item: CoinTxSummary): string => (item.amountSubdued || !inbound(item) ? gray : accent);

  const rowLabel = (item: CoinTxSummary): string =>
    item.kind === 'swap'
      ? 'Swap'
      : item.direction === 'sent'
        ? 'Sent'
        : item.direction === 'received'
          ? 'Received'
          : 'Transfer';

  return (
    <div className="w-full flex flex-col mt-6">
      {/* Section header */}
      <div className="flex items-center px-1 mb-2">
        <span className="text-xs font-semibold" style={{ color: gray }}>
          {title}
        </span>
      </div>

      {/* Loading state: rows in their own shape */}
      <Show when={loading}>
        <div className="flex flex-col gap-1.5">
          <AssetRowSkeleton />
          <AssetRowSkeleton />
        </div>
      </Show>

      {/* Error state */}
      <Show when={!loading && !!error}>
        <div className="py-4 text-center">
          <p className="text-xs" style={{ color: '#ef4444' }}>
            {error}
          </p>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={!loading && !error && items.length === 0}>
        <div className="py-6 text-center">
          <p className="text-xs" style={{ color: gray }}>
            No activity yet
          </p>
        </div>
      </Show>

      {/* List */}
      <Show when={!loading && !error && items.length > 0}>
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <motion.button
              key={`${item.txid}-${item.direction}`}
              type="button"
              whileTap={{ scale: 0.99 }}
              onClick={() => openInExplorer(item.txid)}
              title="View on the explorer"
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl outline-none cursor-pointer text-left"
              style={{ background: row, border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className="flex items-center justify-center rounded-full flex-shrink-0"
                  style={{
                    width: 26,
                    height: 26,
                    background: inbound(item) ? 'rgba(161,255,139,0.12)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  {directionIcon(item)}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold leading-tight" style={{ color: contrast }}>
                    {rowLabel(item)}
                  </span>
                  <span
                    className={`text-[11px] mt-0.5 truncate ${item.description ? '' : 'font-mono'}`}
                    style={{ color: gray, maxWidth: '11rem' }}
                  >
                    {item.description || truncate(item.txid, 8, 6)}
                  </span>
                </div>
              </div>
              <span
                className="text-[13px] font-semibold text-right whitespace-nowrap flex-shrink-0 ml-2"
                style={{ color: amountColor(item) }}
              >
                {item.amountDisplay}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Infinite-scroll sentinel + loading indicator */}
        <Show when={hasMore}>
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            <Show when={loadingMore}>
              <Loader2 size={14} className="animate-spin" style={{ color: gray }} />
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
};
