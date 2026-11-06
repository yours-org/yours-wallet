import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { formatLargeNumber, formatUSD } from '../utils/format';
import { Show } from './Show';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';

/** Amber, for the pending pill. */
const PENDING_COLOR = '#f2b84b';

export type AssetRowProps = {
  icon: string;
  ticker: string;
  balance: number;
  /** USD value; null when the asset has no price (shown as a dash). */
  usdBalance: number | null;
  showPointer: boolean;
  animate?: boolean;
  isLock?: boolean;
  nextUnlock?: number;
  /** Decimal places for balance display. Defaults to 3. */
  decimals?: number;
  /** Part of the balance not spendable yet: shown as an amber pill under the ticker, `hint` on hover. */
  pending?: { label: string; hint: string };
  onClick?: () => void;
};

export const AssetRow = (props: AssetRowProps) => {
  const {
    icon,
    ticker,
    balance,
    usdBalance,
    isLock,
    nextUnlock,
    onClick,
    showPointer,
    animate = false,
    decimals,
    pending,
  } = props;
  const { theme } = useTheme();
  const isDisplaySat = isLock && balance < 0.0001;
  const displayDecimals = decimals ?? (isDisplaySat ? 0 : 3);

  return (
    <motion.div
      whileHover={animate ? { scale: 1.015, x: 2 } : {}}
      whileTap={showPointer ? { scale: 0.985 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex items-center justify-between w-[92%] mx-auto rounded-xl px-0 py-3 mb-1.5"
      style={{
        backgroundColor: theme.color.global.row,
        cursor: showPointer ? 'pointer' : 'default',
        border: `1px solid ${theme.color.global.gray}14`,
      }}
      onClick={onClick}
    >
      {/* Left: icon + name */}
      <div className="flex items-center flex-1 min-w-0 ml-3">
        <Show when={!!icon && icon.length > 0}>
          <img src={icon} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt={ticker} />
        </Show>
        <div className="flex flex-col items-start ml-3 min-w-0">
          <span className="text-sm font-semibold leading-tight" style={{ color: theme.color.global.contrast }}>
            {ticker}
          </span>
          <Show
            when={!!pending}
            whenFalseContent={
              <span className="text-xs mt-0.5" style={{ color: theme.color.global.gray }}>
                {isLock ? 'Next unlock' : 'Balance'}
              </span>
            }
          >
            <span
              title={pending?.hint}
              className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none cursor-help"
              style={{ color: PENDING_COLOR, backgroundColor: `${PENDING_COLOR}26` }}
            >
              <Info size={10} strokeWidth={2.5} />
              {pending?.label}
            </span>
          </Show>
        </div>
      </div>

      {/* Right: balance */}
      <div className="flex flex-col items-end mr-3 min-w-0 max-w-[45%]">
        <span className="text-sm font-semibold text-right leading-tight" style={{ color: theme.color.global.contrast }}>
          {`${formatLargeNumber(
            isDisplaySat ? balance * BSV_DECIMAL_CONVERSION : balance,
            displayDecimals,
          )}${isLock ? (isDisplaySat ? `${balance === 0.00000001 ? ' SAT' : ' SATS'}` : ' BSV') : ''}`}
        </span>
        <span className="text-xs mt-0.5 text-right" style={{ color: theme.color.global.gray }}>
          {isLock ? `Block ${nextUnlock}` : usdBalance === null ? '—' : formatUSD(usdBalance)}
        </span>
      </div>
    </motion.div>
  );
};
