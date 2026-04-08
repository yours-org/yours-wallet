import { useState } from 'react';
import { motion } from 'framer-motion';
import { Droplets, Loader2 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { requestTestnetCoins } from '../api/faucet';
import { useSnackbar } from '../hooks/useSnackbar';
import { Transaction } from '@bsv/sdk';
import { useServiceContext } from '../hooks/useServiceContext';

interface FaucetButtonProps {
  address: string;
  isTestnet: boolean;
  onConfirmation: () => void;
}

export function FaucetButton({ address, isTestnet, onConfirmation }: FaucetButtonProps) {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const { wallet } = useServiceContext();
  const [isLoading, setIsLoading] = useState(false);

  const handleGetCoins = async () => {
    if (!isTestnet) return;
    setIsLoading(true);
    try {
      const response = await requestTestnetCoins(address);
      if (response.code === 0) {
        const tx = Transaction.fromHex(response.raw);
        const res = await wallet.ingestTransaction(tx, 'faucet');
        if (res?.parseContext?.txid) {
          onConfirmation();
        } else {
          addSnackbar('Transaction sent, but not yet confirmed. Please check your balance later.', 'info');
        }
      } else if (response.code === 20) {
        throw new Error('Address still in cooldown. Please wait before requesting again.');
      } else {
        throw new Error(response.message || 'An unknown error occurred. Please try again later.');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get testnet coins. Please try again later.';
      addSnackbar(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isTestnet) return null;

  const outlineLeft = theme.color.component.secondaryOutlineButtonGradientLeft;
  const outlineRight = theme.color.component.secondaryOutlineButtonGradientRight;

  return (
    <div className="flex justify-center w-full mt-1">
      <div
        className="p-px rounded-full"
        style={{ background: `linear-gradient(135deg, ${outlineLeft}, ${outlineRight})` }}
      >
        <motion.button
          onClick={handleGetCoins}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer"
          style={{
            backgroundColor: theme.color.global.walletBackground,
            color: theme.color.global.gray,
            fontFamily: "'Inter', Arial, Helvetica, sans-serif",
          }}
          whileHover={!isLoading ? { scale: 1.03 } : undefined}
          whileTap={!isLoading ? { scale: 0.97 } : undefined}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Droplets className="w-3 h-3" />}
          {isLoading ? 'Requesting...' : 'Get Testnet Coins'}
        </motion.button>
      </div>
    </div>
  );
}
