import { useState } from 'react';
import { Button } from './Button';
import { useTheme } from '../hooks/useTheme';
import { requestTestnetCoins } from '../api/faucet';
import { useSnackbar } from '../hooks/useSnackbar';
import { ParseMode } from 'spv-store';
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
  const { oneSatSPV } = useServiceContext();
  const [isLoading, setIsLoading] = useState(false);

  const handleGetCoins = async () => {
    if (!isTestnet) return;

    setIsLoading(true);

    try {
      const response = await requestTestnetCoins(address);

      if (response.code === 0) {
        const tx = Transaction.fromHex(response.raw);
        const res = await oneSatSPV.stores.txos?.ingest(tx, 'faucet', ParseMode.Persist, false);
        if (res?.txid) {
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

  return (
    <Button
      theme={theme}
      type="secondary-outline"
      label={isLoading ? 'Requesting...' : 'Get Testnet Coins'}
      onClick={handleGetCoins}
      disabled={isLoading}
    />
  );
}
