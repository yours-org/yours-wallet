import { useState } from 'react';
import { Button } from './Button';
import { useTheme } from '../hooks/useTheme';

interface FaucetButtonProps {
  address: string;
  isTestnet: boolean;
}

export function FaucetButton({ address, isTestnet }: FaucetButtonProps) {
  const { theme } = useTheme();

  const [isLoading, setIsLoading] = useState(false);

  const handleGetCoins = async () => {
    if (!isTestnet) return;

    setIsLoading(true);
    try {
      //   const { txid } = await requestTestnetCoins(address);
      const { txid } = { txid: 2 };
    } catch (error) {
      setIsLoading(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isTestnet) return null;

  return <Button theme={theme} type="primary" label="Get Faucent" onClick={() => handleGetCoins()} />;
}
