import { motion } from 'framer-motion';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NetWork } from 'yours-wallet-provider';
import bsvCoin from '../assets/bsv-coin.svg';
import lock from '../assets/lock.svg';
import { useServiceContext } from '../hooks/useServiceContext';
import { Theme } from '../theme.types';
import {
  BSV_DECIMAL_CONVERSION,
  GENERIC_NFT_ICON,
  GENERIC_TOKEN_ICON,
  MNEE_DECIMALS,
  MNEE_SYM,
  URL_WHATSONCHAIN,
  URL_WHATSONCHAIN_TESTNET,
} from '../utils/constants';
import { formatNumberWithCommasAndDecimals } from '../utils/format';
import { Button } from './Button';
import { Show } from './Show';

// TODO: TxLog type needs to be implemented in 1sat-wallet-toolbox
// import { TxLog } from 'spv-store';
type TxLog = {
  txid: string;
  idx: number;
  date: Date;
  summary: Record<string, { amount: number; icon?: string }>;
};

type TxTag = 'bsv21' | 'origin' | 'list' | 'lock' | 'fund';

export type TxHistoryProps = {
  theme: Theme;
  onBack: () => void;
};

const groupByDate = (items: TxLog[]): { label: string; items: TxLog[] }[] => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const thisWeek = new Date(today.getTime() - 6 * 86400000);

  const groups: Record<string, TxLog[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  };

  for (const item of items) {
    const d = new Date(item.date);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= today) groups['Today'].push(item);
    else if (day >= yesterday) groups['Yesterday'].push(item);
    else if (day >= thisWeek) groups['This Week'].push(item);
    else groups['Earlier'].push(item);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, items: list }));
};

export const TxHistory = (props: TxHistoryProps) => {
  const { theme, onBack } = props;
  const [data, setData] = useState<TxLog[]>();
  const { chromeStorageService, apiContext } = useServiceContext();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const isTestnet = chromeStorageService.getNetwork() === NetWork.Testnet;

  const tagPriorityOrder: TxTag[] = ['list', 'bsv21', 'origin', 'lock', 'fund'];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await apiContext.wallet.listActions({
          labels: [],
          includeLabels: true,
          includeOutputs: true,
          limit: 100,
          offset: 0,
        });

        // TODO: Categorize transactions by type using action.labels and output baskets:
        // - BSV-21 tokens: check for 'bsv21' basket/labels, use token symbol & icon, show token amounts
        // - 1Sat Ordinals/NFTs: check for 'origin'/'1sat' basket, show NFT icon & transfer info
        // - Lock contracts: check for 'lock' basket, show lock/unlock amounts
        // - Listings: check for 'ordlock' basket, show list/cancel/purchase
        // - Filter or group mixed transactions (e.g. a send that includes both BSV and a token)
        // Currently all transactions are shown as BSV fund transfers.
        //
        // TODO: Use actual transaction dates once WalletAction exposes created_at
        const txLogs: TxLog[] = result.actions.map((action, idx) => ({
          txid: action.txid,
          idx,
          date: new Date(),
          summary: {
            fund: {
              amount: action.satoshis,
            },
          },
        }));

        setData(txLogs);
      } catch (error) {
        console.error('Error fetching transaction history:', error);
        setData([]);
      }
    };

    fetchData();
  }, [apiContext.wallet]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data?.slice(startIndex, endIndex);
  }, [currentPage, data]);

  const handleNextPage = () => {
    if (currentPage * itemsPerPage < (data?.length ?? 0)) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleOpenLink = (txid: string) => {
    const url = isTestnet ? `${URL_WHATSONCHAIN_TESTNET}${txid}` : `${URL_WHATSONCHAIN}${txid}`;
    window.open(url, '_blank');
  };

  const getIconForSummary = (tag: TxTag, icon?: string) => {
    switch (tag) {
      case 'fund':
        return <img src={bsvCoin} alt="Fund Icon" className="w-9 h-9" />;
      case 'lock':
        return <img src={lock} alt="Lock Icon" className="w-9 h-9" />;
      case 'list':
        return (
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full"
            style={{ backgroundColor: theme.color.global.contrast }}
          >
            <TagIcon size={14} style={{ color: theme.color.global.row }} />
          </div>
        );
      default:
        return icon ? (
          <img
            src={`${apiContext.services?.baseUrl}/content/${icon}`}
            alt="Summary Icon"
            className={`w-9 h-9 object-cover ${tag === 'origin' ? 'rounded' : 'rounded-full'}`}
          />
        ) : tag === ('origin' as TxTag) ? (
          <img src={GENERIC_NFT_ICON} alt="Generic NFT Icon" className="w-9 h-9 rounded" />
        ) : (
          <img src={GENERIC_TOKEN_ICON} alt="Generic Token Icon" className="w-9 h-9 rounded-full" />
        );
    }
  };

  const sortEntriesByPriority = (entries: [TxTag, { id?: string; icon?: string; amount?: number }][]) => {
    return entries.sort((a, b) => {
      const aPriority = tagPriorityOrder.indexOf(a[0]);
      const bPriority = tagPriorityOrder.indexOf(b[0]);
      return (aPriority === -1 ? Infinity : aPriority) - (bPriority === -1 ? Infinity : bPriority);
    });
  };

  const toggleRowExpansion = (uniqueId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uniqueId)) newSet.delete(uniqueId);
      else newSet.add(uniqueId);
      return newSet;
    });
  };

  const getHeaderText = (tag: TxTag, tokenName?: string) => {
    switch (tag) {
      case 'bsv21':
        return tokenName || 'Token';
      case 'origin':
        return 'NFT';
      case 'list':
        return 'Listing';
      case 'lock':
        return 'Lock';
      case 'fund':
        return 'BSV';
      default:
        return 'Unknown';
    }
  };

  const getDescriptionText = (tag: TxTag, amount: number) => {
    switch (tag) {
      case 'list':
        return amount === -1 ? 'Listed for sale' : amount === 0 ? 'Cancelled listing' : 'Purchased listing';
      case 'lock':
        return 'Lock contract';
      default:
        return amount === 0 ? 'Transfer' : amount > 0 ? 'Received' : 'Sent';
    }
  };

  const getAmountText = (tag: TxTag, amount: number) => {
    switch (tag) {
      case 'fund':
        return amount / BSV_DECIMAL_CONVERSION;
      case 'bsv21':
        return amount;
      case 'lock':
        return amount / BSV_DECIMAL_CONVERSION + ' BSV';
      default:
        return amount.toLocaleString() + ' sats';
    }
  };

  const formatMNEEAmount = (amount: number) => {
    return formatNumberWithCommasAndDecimals(
      getAmountText('bsv21', amount) as number,
      Math.abs(amount) >= 0.01 ? 2 : MNEE_DECIMALS,
    );
  };

  const getDirectionIcon = (amount: number) => {
    if (amount > 0)
      return <ArrowDownLeft size={10} style={{ color: theme.color.component.primaryButtonLeftGradient }} />;
    if (amount < 0) return <ArrowUpRight size={10} style={{ color: theme.color.global.gray }} />;
    return <ArrowLeftRight size={10} style={{ color: theme.color.global.gray }} />;
  };

  const grouped = useMemo(() => groupByDate(paginatedData || []), [paginatedData]);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 35 }}
      className="flex flex-col items-center w-full h-screen overflow-y-auto absolute z-[1000]"
      style={{ backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Header */}
      <div className="flex items-center justify-between w-full px-5 pt-12 pb-4">
        <span className="text-lg font-bold" style={{ color: theme.color.global.contrast }}>
          Recent Activity
        </span>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.92 }}
          onClick={onBack}
          className="flex items-center justify-center w-8 h-8 rounded-full outline-none border-none cursor-pointer"
          style={{ backgroundColor: theme.color.global.row }}
        >
          <X size={16} style={{ color: theme.color.global.contrast }} />
        </motion.button>
      </div>

      {/* Transaction list */}
      <div className="flex flex-col w-full px-3 gap-1 pb-4">
        {(paginatedData || []).length > 0 ? (
          <>
            {grouped.map(({ label, items }) => (
              <div key={label} className="w-full mb-1">
                {/* Date group label */}
                <div className="px-2 pb-1 pt-2">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: theme.color.global.gray }}
                  >
                    {label}
                  </span>
                </div>

                {/* Rows */}
                <div className="flex flex-col gap-1">
                  {items.map((t) => {
                    const summaryEntries = sortEntriesByPriority(
                      Object.entries(t.summary || {}).filter(([key]) => tagPriorityOrder.includes(key as TxTag)) as [
                        TxTag,
                        { id?: string; icon?: string; amount?: number },
                      ][],
                    );
                    const uniqueId = `${t.txid}-${t.idx}`;
                    const isExpanded = expandedRows.has(uniqueId);
                    const isMulti = summaryEntries.length > 1;

                    return (
                      <motion.div
                        key={uniqueId}
                        layout
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        onClick={isMulti ? () => toggleRowExpansion(uniqueId) : undefined}
                        className={`w-full rounded-xl px-3 py-2.5 transition-colors duration-150 bg-[#17191E] ${isMulti ? 'cursor-pointer hover:bg-[#1f2128]' : ''}`}
                        style={{
                          border: `1px solid ${theme.color.global.gray}14`,
                          cursor: isMulti ? 'pointer' : 'default',
                        }}
                      >
                        <div className="flex flex-col gap-2">
                          {summaryEntries.slice(0, isExpanded ? summaryEntries.length : 1).map(([key, value], idx) => (
                            <div key={idx} className="flex items-center justify-between">
                              {/* Left: stacked icons or single icon + text */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="relative flex-shrink-0" style={{ width: '2.25rem', height: '2.25rem' }}>
                                  {isExpanded
                                    ? getIconForSummary(key, value.icon)
                                    : summaryEntries.slice(0, 3).map(([k, v], iconIdx) => (
                                        <div
                                          key={iconIdx}
                                          className="absolute"
                                          style={{
                                            left: `${iconIdx * 0.65}rem`,
                                            zIndex: 3 - iconIdx,
                                          }}
                                        >
                                          {getIconForSummary(k, v.icon)}
                                        </div>
                                      ))}
                                </div>
                                <div className="flex flex-col items-start min-w-0">
                                  <div className="flex items-center gap-1">
                                    {getDirectionIcon(value.amount ?? 0)}
                                    <span
                                      className="text-sm font-semibold leading-tight"
                                      style={{ color: theme.color.global.contrast }}
                                    >
                                      {getHeaderText(key, value.id)}
                                    </span>
                                  </div>
                                  <span className="text-xs mt-0.5" style={{ color: theme.color.global.gray }}>
                                    {getDescriptionText(key, value.amount ?? 0)}
                                  </span>
                                </div>
                              </div>

                              {/* Right: amount + link + expand */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span
                                  className="text-xs font-bold text-right"
                                  style={{
                                    color: value?.amount
                                      ? value.amount >= 1
                                        ? theme.color.component.primaryButtonLeftGradient
                                        : key === 'origin' && value.amount === -1
                                          ? 'transparent'
                                          : theme.color.global.contrast
                                      : 'transparent',
                                  }}
                                >
                                  {value.amount && value.amount > 0 ? '+' : ''}
                                  {value.id === MNEE_SYM
                                    ? formatMNEEAmount(value.amount ?? 0)
                                    : getAmountText(key, value.amount ?? 0)}
                                </span>

                                <Show when={idx === 0}>
                                  <motion.button
                                    whileHover={{ scale: 1.15 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenLink(t.txid);
                                    }}
                                    className="outline-none border-none bg-transparent cursor-pointer p-0.5 flex-shrink-0"
                                    title="See transaction in Whatsonchain"
                                  >
                                    <ExternalLink
                                      size={12}
                                      style={{ color: theme.color.component.primaryButtonLeftGradient }}
                                    />
                                  </motion.button>
                                </Show>

                                {idx === 0 && isMulti ? (
                                  isExpanded ? (
                                    <ChevronUp size={12} style={{ color: theme.color.global.gray }} />
                                  ) : (
                                    <ChevronDown size={12} style={{ color: theme.color.global.gray }} />
                                  )
                                ) : (
                                  <span className="inline-block w-3 h-4" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Pagination */}
            <div className="flex items-center justify-between w-[87%] mx-auto mt-3 gap-3">
              <div className="flex-1">
                <Button
                  theme={theme}
                  type="secondary"
                  label="Previous"
                  disabled={currentPage === 1}
                  onClick={handlePreviousPage}
                />
              </div>
              <div className="flex-1">
                <Button
                  theme={theme}
                  type="secondary"
                  label="Next"
                  onClick={handleNextPage}
                  disabled={currentPage * itemsPerPage >= (data?.length ?? 0)}
                />
              </div>
            </div>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center mt-20 gap-3"
          >
            <div
              className="flex items-center justify-center w-14 h-14 rounded-full"
              style={{ backgroundColor: theme.color.global.row }}
            >
              <ArrowLeftRight size={22} style={{ color: theme.color.global.gray }} />
            </div>
            <p className="text-sm" style={{ color: theme.color.global.gray }}>
              No transactions yet
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
