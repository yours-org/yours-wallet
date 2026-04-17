import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ExternalLink, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NetWork } from 'yours-wallet-provider';
import { useServiceContext } from '../hooks/useServiceContext';
import { useIntersectionObserver } from '../hooks/useIntersectObserver';
import { useTheme } from '../hooks/useTheme';
import { URL_WHATSONCHAIN, URL_WHATSONCHAIN_TESTNET } from '../utils/constants';
import { fetchBsv21History, fetchBsvHistory, fetchMneeHistory, type CoinTxSummary } from '../utils/coinHistory';
import { truncate } from '../utils/format';
import { Show } from './Show';

export type CoinHistoryFilter =
  | { type: 'bsv' }
  | { type: 'mnee'; addresses: string[] }
  | { type: 'bsv21'; tokenId: string; decimals: number; symbol?: string };

export type CoinHistoryProps = {
  filter: CoinHistoryFilter;
  pageSize?: number;
  /** Bump to force a refetch (e.g. after a successful send). */
  refreshKey?: number | string;
};

const filterKey = (filter: CoinHistoryFilter): string => {
  switch (filter.type) {
    case 'bsv':
      return 'bsv';
    case 'mnee':
      return `mnee:${filter.addresses.join(',')}`;
    case 'bsv21':
      return `bsv21:${filter.tokenId}`;
  }
};

export const CoinHistory = ({ filter, pageSize = 25, refreshKey }: CoinHistoryProps) => {
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

  const isTestnet = chromeStorageService.getNetwork() === NetWork.Testnet;
  const wocBaseUrl = isTestnet ? URL_WHATSONCHAIN_TESTNET : URL_WHATSONCHAIN;

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const row = theme.color.global.row;
  const accent = theme.color.component.primaryButtonLeftGradient;

  const fetchPage = useCallback(
    async (offset: number): Promise<CoinTxSummary[]> => {
      switch (filter.type) {
        case 'bsv':
          return fetchBsvHistory(apiContext, { offset, limit: pageSize });
        case 'mnee':
          // MNEE paginates via score, not offset — on a fresh fetch, pass no fromScore;
          // for Load More, use the lowest score we've seen so far.
          return fetchMneeHistory(apiContext, filter.addresses, {
            limit: pageSize,
            fromScore: offset === 0 ? undefined : offset,
          });
        case 'bsv21':
          return fetchBsv21History(apiContext, filter.tokenId, filter.decimals, filter.symbol, {
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

  const openOnWoC = (txid: string) => window.open(`${wocBaseUrl}${txid}`, '_blank');

  const directionIcon = (direction: CoinTxSummary['direction']) => {
    switch (direction) {
      case 'received':
        return <ArrowDownLeft size={12} style={{ color: accent }} />;
      case 'sent':
        return <ArrowUpRight size={12} style={{ color: gray }} />;
      default:
        return <ArrowLeftRight size={12} style={{ color: gray }} />;
    }
  };

  const amountColor = (item: CoinTxSummary): string => {
    if (item.amountSubdued) return gray;
    return item.direction === 'received' ? accent : contrast;
  };

  return (
    <div className="w-full flex flex-col mt-6">
      {/* Section header */}
      <div className="flex items-center px-1 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: gray }}>
          Recent Activity
        </span>
        <div className="flex-1 ml-3 h-px opacity-20" style={{ backgroundColor: gray }} />
      </div>

      {/* Loading state */}
      <Show when={loading}>
        <div className="flex items-center justify-center py-6">
          <Loader2 size={16} className="animate-spin" style={{ color: gray }} />
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
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => openOnWoC(item.txid)}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl border-0 outline-none cursor-pointer text-left"
              style={{
                background: row,
                border: `1px solid ${gray}14`,
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className="flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
                  style={{ background: `${gray}18` }}
                >
                  {directionIcon(item.direction)}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold leading-tight" style={{ color: contrast }}>
                    {item.direction === 'sent' ? 'Sent' : item.direction === 'received' ? 'Received' : 'Transfer'}
                  </span>
                  <span className="text-[10px] mt-0.5 truncate font-mono" style={{ color: gray, maxWidth: '10rem' }}>
                    {item.description || truncate(item.txid, 6, 4)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                <span className="text-xs font-bold text-right whitespace-nowrap" style={{ color: amountColor(item) }}>
                  {item.amountDisplay}
                </span>
                <ExternalLink size={11} style={{ color: accent }} />
              </div>
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
