import { motion } from 'framer-motion';
import { useTheme } from '../hooks/useTheme';
import { formatLargeNumber, formatUSD } from '../utils/format';
import { Show } from './Show';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';

const GradientButton = ({ onClick, theme }: { onClick?: () => void; theme: ReturnType<typeof useTheme>['theme'] }) => (
  <motion.button
    whileHover={{ scale: 1.03 }}
    whileTap={{ scale: 0.97 }}
    onClick={onClick}
    className="text-xs font-bold px-4 py-2 rounded-xl mr-3 cursor-pointer border-0 outline-none"
    style={{
      background: 'linear-gradient(135deg, #de973f, #f9dd63)',
      color: theme.color.global.row,
      minWidth: '7rem',
    }}
  >
    Get MNEE
  </motion.button>
);

export type AssetRowProps = {
  icon: string;
  ticker: string;
  balance: number;
  usdBalance: number;
  showPointer: boolean;
  isMNEE?: boolean;
  animate?: boolean;
  isLock?: boolean;
  nextUnlock?: number;
  onGetMneeClick?: () => void;
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
    isMNEE,
    showPointer,
    onGetMneeClick,
    animate = false,
  } = props;
  const { theme } = useTheme();
  const isDisplaySat = isLock && balance < 0.0001;
  const isMneeBalanceZero = !!isMNEE && usdBalance === 0;

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
          <span className="text-xs mt-0.5" style={{ color: theme.color.global.gray }}>
            {isLock ? 'Next unlock' : 'Balance'}
          </span>
        </div>
      </div>

      {/* Right: balance */}
      <Show
        when={isMneeBalanceZero}
        whenFalseContent={
          <div className="flex flex-col items-end mr-3 min-w-0 max-w-[45%]">
            <span
              className="text-sm font-semibold text-right leading-tight"
              style={{ color: theme.color.global.contrast }}
            >
              {`${formatLargeNumber(
                isDisplaySat ? balance * BSV_DECIMAL_CONVERSION : balance,
                isDisplaySat ? 0 : 3,
              )}${isLock ? (isDisplaySat ? `${balance === 0.00000001 ? ' SAT' : ' SATS'}` : ' BSV') : ''}`}
            </span>
            <span className="text-xs mt-0.5 text-right" style={{ color: theme.color.global.gray }}>
              {isLock ? `Block ${nextUnlock}` : formatUSD(usdBalance)}
            </span>
          </div>
        }
      >
        <GradientButton theme={theme} onClick={onGetMneeClick} />
      </Show>
    </motion.div>
  );
};
