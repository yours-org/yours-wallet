import { useState, useEffect } from 'react';
import { Button } from './Button';
import { useTheme } from '../hooks/useTheme';
import { requestTestnetCoins, waitForTransaction, getAddressBalance } from '../api/faucet';
import { useServiceContext } from '../hooks/useServiceContext';

interface FaucetButtonProps {
  address: string;
  isTestnet: boolean;
}

const MAX_MESSAGE_LENGTH = 100;

const shortenMessage = (message: string) => {
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.substring(0, MAX_MESSAGE_LENGTH)}...`
    : message;
};

export function FaucetButton({ address, isTestnet }: FaucetButtonProps) {
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (isTestnet && address) {
      fetchBalance();
    }
  }, [isTestnet, address]);

  const fetchBalance = async () => {
    try {
      const newBalance = await getAddressBalance(address);
      setBalance(newBalance);
    } catch (error) {
      console.error('Error fetching balance:', error);
      setMessage('Failed to fetch balance. Please try again later.');
    }
  };

  const handleGetCoins = async () => {
    if (!isTestnet) return;

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await requestTestnetCoins(address);

      if (response.code === 0) {
        setMessage(`Testnet coins requested. Transaction ID: ${response.txid}`);

        const isConfirmed = await waitForTransaction(response.txid);
        if (isConfirmed) {
          await fetchBalance();
          setMessage('Testnet coins successfully sent and confirmed!');
        } else {
          setMessage('Transaction sent, but not yet confirmed. Please check your balance later.');
        }
      } else if (response.code === 20) {
        throw new Error('Address still in cooldown. Please wait before requesting again.');
      } else {
        throw new Error(response.message || 'An unknown error occurred. Please try again later.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get testnet coins. Please try again later.';
      setMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isTestnet) return null;

  return (
    <div className="space-y-4">
      <Button
        theme={theme}
        type="primary"
        label={isLoading ? 'Requesting...' : 'Get Faucet'}
        onClick={handleGetCoins}
        disabled={isLoading}
      />
      {message && (
        <p className="ext-sm text-gray-600 text-center">
          {shortenMessage(message)}
        </p>
      )}
    </div>
  );
}