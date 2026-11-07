import { motion } from 'framer-motion';
import { ArrowDownToLine, ArrowLeft, ArrowLeftRight, ArrowUpFromLine } from 'lucide-react';
import bsvCoin from '../assets/bsv-coin.svg';
import { useTheme } from '../hooks/useTheme';
import { displayNumber, formatUSD } from '../utils/format';
import { CoinHistory } from './CoinHistory';

export type BsvDetailViewProps = {
  /** Spendable BSV. */
  balanceBsv: number;
  /** USD per BSV. */
  bsvUsdRate: number;
  chain: 'main' | 'test';
  /** Swap is offered when the chain has an exchange. */
  swapAvailable: boolean;
  onBack: () => void;
  onReceive: () => void;
  onSend: () => void;
  onSwap: () => void;
  /** Changes when a send finished, so History reloads. */
  refreshKey?: number | string;
};

/** The BSV page: balance, price, Receive / Swap / Send, history. The same shape as a token's page. */
export const BsvDetailView = ({
  balanceBsv,
  bsvUsdRate,
  chain,
  swapAvailable,
  onBack,
  onReceive,
  onSend,
  onSwap,
  refreshKey,
}: BsvDetailViewProps) => {
  const { theme } = useTheme();
  const gray = theme.color.global.gray;
  const contrast = theme.color.global.contrast;
  const primaryGradient = `linear-gradient(135deg, ${theme.color.component.primaryButtonLeftGradient}, ${theme.color.component.primaryButtonRightGradient})`;
  const primaryText = theme.color.component.primaryButtonText;

  const actionButton = (label: string, Icon: typeof ArrowDownToLine, onClick: () => void) => (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-[13px] font-semibold outline-none border-none cursor-pointer"
      style={{ background: primaryGradient, color: primaryText }}
    >
      <Icon size={15} />
      {label}
    </motion.button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ type: 'spring', stiffness: 320, damping: 35 }}
      className="flex flex-col w-full pt-3 pb-4 overflow-y-auto overflow-x-hidden self-start"
      style={{
        height: '100%',
        backgroundColor: theme.color.global.walletBackground,
        fontFamily: "'Inter', Arial, Helvetica, sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 mb-5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          aria-label="Back"
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 outline-none border-none cursor-pointer"
          style={{ backgroundColor: '#17191E' }}
        >
          <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
        </motion.button>
        <img src={bsvCoin} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
        <span className="text-base font-bold" style={{ color: contrast }}>
          BSV
        </span>
        <span className="ml-auto text-[11px] flex-shrink-0" style={{ color: gray }}>
          Bitcoin SV · {chain === 'test' ? 'testnet' : 'mainnet'}
        </span>
      </div>

      {/* Balance */}
      <div className="flex flex-col items-center w-full px-4 mb-3 gap-1">
        <span className="text-xs" style={{ color: gray }}>
          Balance
        </span>
        <span
          className="text-[32px] font-bold leading-tight break-all text-center"
          style={{ color: contrast }}
          title={`${balanceBsv.toFixed(8)} BSV`}
        >
          {displayNumber(balanceBsv)}
        </span>
        <span className="text-sm" style={{ color: gray }}>
          {bsvUsdRate > 0 ? formatUSD(balanceBsv * bsvUsdRate) : '—'}
        </span>
      </div>

      {/* Price line */}
      <div className="flex items-center justify-center gap-2 px-4 mb-4 min-h-[18px] text-xs" style={{ color: gray }}>
        {bsvUsdRate > 0 ? (
          <span>
            Price <span style={{ color: contrast }}>1 BSV = {formatUSD(bsvUsdRate)}</span>
          </span>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center w-full mb-5">
        <div className="flex w-[88%]" style={{ gap: 10 }}>
          {actionButton('Receive', ArrowDownToLine, onReceive)}
          {swapAvailable && actionButton('Swap', ArrowLeftRight, onSwap)}
          {actionButton('Send', ArrowUpFromLine, onSend)}
        </div>
      </div>

      {/* History */}
      <div className="w-full px-4">
        <CoinHistory title="History" filter={{ type: 'bsv' }} refreshKey={refreshKey} />
      </div>
    </motion.div>
  );
};
