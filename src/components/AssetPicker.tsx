import { motion } from 'framer-motion';
import { ArrowLeft, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Bsv21Balance } from '@1sat/actions';
import { useTheme } from '../hooks/useTheme';
import { formatLargeNumber, formatUSD, showAmount } from '../utils/format';
import { Show } from './Show';

export type PickableAsset =
  | { kind: 'bsv'; ticker: 'BSV'; icon: string; balance: number; usdBalance: number }
  | { kind: 'mnee'; ticker: 'MNEE'; icon: string; balance: number; usdBalance: number }
  | { kind: 'bsv21'; token: Bsv21Balance; icon: string };

export type AssetPickerProps = {
  onBack: () => void;
  onSelect: (asset: PickableAsset) => void;
  assets: PickableAsset[];
};

const getTicker = (asset: PickableAsset): string => {
  if (asset.kind === 'bsv21') return asset.token.sym || 'Token';
  return asset.ticker;
};

const getId = (asset: PickableAsset): string => {
  if (asset.kind === 'bsv21') return asset.token.id || asset.token.sym || 'token';
  return asset.kind;
};

const getDisplayBalance = (asset: PickableAsset): { primary: string; secondary: string } => {
  switch (asset.kind) {
    case 'bsv':
      return {
        primary: `${formatLargeNumber(asset.balance, 3)} BSV`,
        secondary: formatUSD(asset.usdBalance),
      };
    case 'mnee':
      return {
        primary: formatUSD(asset.usdBalance),
        secondary: `${formatLargeNumber(asset.balance, 5)} MNEE`,
      };
    case 'bsv21': {
      const confirmed = asset.token.all.confirmed;
      const display = showAmount(confirmed, asset.token.dec);
      const sym = asset.token.sym || 'Token';
      return {
        primary: `${display} ${sym}`,
        secondary: confirmed > 0n ? 'Available' : 'No balance',
      };
    }
  }
};

export const AssetPicker = ({ onBack, onSelect, assets }: AssetPickerProps) => {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const row = theme.color.global.row;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => {
      const ticker = getTicker(a).toLowerCase();
      if (ticker.includes(q)) return true;
      if (a.kind === 'bsv21' && a.token.id?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [assets, query]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex flex-col items-center w-full pt-14 pb-20 px-4 overflow-y-auto overflow-x-hidden self-start"
      style={{ height: '100%', backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 w-full mb-5">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 border-0 outline-none cursor-pointer"
          style={{ background: '#17191E' }}
        >
          <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
        </motion.button>
        <h2 className="text-base font-bold tracking-tight flex-1" style={{ color: contrast }}>
          Send
        </h2>
      </div>

      {/* Search */}
      <div className="relative w-full mb-4">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: gray }}
        />
        <input
          type="text"
          placeholder="Search assets..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-10 pl-9 pr-4 rounded-xl text-sm outline-none border transition-all duration-200"
          style={{
            backgroundColor: row,
            borderColor: gray + '40',
            color: contrast,
            fontFamily: "'Inter', Arial, Helvetica, sans-serif",
          }}
        />
      </div>

      {/* Section label */}
      <div className="flex items-center w-full mb-2 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: gray }}>
          Select an asset
        </span>
        <div className="flex-1 ml-3 h-px opacity-20" style={{ backgroundColor: gray }} />
      </div>

      {/* Asset list */}
      <Show
        when={filtered.length > 0}
        whenFalseContent={
          <div className="flex flex-col items-center justify-center py-10 gap-2 w-full">
            <p className="text-sm" style={{ color: gray }}>
              No assets match "{query}"
            </p>
          </div>
        }
      >
        <div className="w-full flex flex-col gap-2">
          {filtered.map((asset) => {
            const { primary, secondary } = getDisplayBalance(asset);
            return (
              <motion.button
                key={getId(asset)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onSelect(asset)}
                className="flex items-center justify-between w-full px-3 py-3 rounded-xl border-0 outline-none cursor-pointer text-left"
                style={{
                  background: row,
                  border: `1px solid ${gray}14`,
                }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <img
                    src={asset.icon}
                    alt={getTicker(asset)}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-semibold leading-tight" style={{ color: contrast }}>
                      {getTicker(asset)}
                    </span>
                    {asset.kind === 'bsv21' && asset.token.id && (
                      <span className="text-[10px] mt-0.5 font-mono truncate max-w-[10rem]" style={{ color: gray }}>
                        {asset.token.id}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end min-w-0 max-w-[40%] ml-3">
                  <span className="text-sm font-semibold text-right leading-tight" style={{ color: contrast }}>
                    {primary}
                  </span>
                  <span className="text-xs mt-0.5 text-right" style={{ color: gray }}>
                    {secondary}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </Show>

      {/* Footer hint */}
      <Show when={assets.length > 0}>
        <p className="text-[11px] mt-4 text-center" style={{ color: gray }}>
          Don't see your token? Go to Assets and tap <span className="font-semibold">Manage Tokens List</span>.
        </p>
      </Show>

      {/* Foot padding */}
      <div aria-hidden className="h-4 w-full flex-shrink-0"></div>
    </motion.div>
  );
};
