import { useState } from 'react';
import styled from 'styled-components';
import { useTheme } from '../hooks/useTheme';
import { useViewport } from '../hooks/useViewport';
import { WhiteLabelTheme } from '../theme.types';
import { sleep } from '../utils/sleep';
import { Button } from './Button';
import { Input } from './Input';
import { FormContainer, HeaderText, Text } from './Reusable';
import { useServiceContext } from '../hooks/useServiceContext';
import { YoursIcon } from './YoursIcon';
import { sendMessageAsync } from '../utils/chromeHelpers';

const Container = styled.div<WhiteLabelTheme & { $isMobile: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: ${(props) => (props.$isMobile ? '100vw' : '22.5rem')};
  height: ${(props) => (props.$isMobile ? '100vh' : '33.75rem')};
  margin: 0;
  background-color: ${({ theme }) => theme.color.global.walletBackground};
  color: ${({ theme }) => theme.color.global.contrast};
  z-index: 100;
`;

export type UnlockWalletProps = {
  onUnlock: () => void;
};

export const UnlockWallet = (props: UnlockWalletProps) => {
  const { onUnlock } = props;
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const { isMobile } = useViewport();
  const { chromeStorageService } = useServiceContext();

  const handleUnlock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);
    await sleep(25);

    const isVerified = chromeStorageService.verifyPassword(password);
    if (isVerified) {
      setVerificationFailed(false);
      const timestamp = Date.now();
      await chromeStorageService.update({ lastActiveTime: timestamp });

      // Tell the service worker to reinitialize the wallet and wait for it to complete
      try {
        const response = await sendMessageAsync<{ success: boolean; error?: string }>({
          action: 'WALLET_UNLOCKED',
        });
        if (!response?.success) {
          console.error('Wallet unlock failed:', response?.error);
        }
      } catch (error) {
        console.error('Wallet unlock error:', error);
      }

      onUnlock();
    } else {
      setVerificationFailed(true);
      setTimeout(() => {
        setVerificationFailed(false);
        setIsProcessing(false);
      }, 900);
    }
  };

  return (
    <Container $isMobile={isMobile} theme={theme}>
      <YoursIcon width="4rem" />
      <HeaderText style={{ fontSize: '1.75rem' }} theme={theme}>
        Unlock Wallet
      </HeaderText>
      <Text theme={theme}>Use password to unlock your wallet.</Text>
      <FormContainer onSubmit={handleUnlock}>
        <Input
          theme={theme}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          shake={verificationFailed ? 'true' : 'false'}
          autoFocus
          onKeyDown={(e) => e.stopPropagation()}
        />
        <Button
          theme={theme}
          type="secondary-outline"
          label={isProcessing ? 'Unlocking...' : 'Unlock'}
          disabled={isProcessing || password === ''}
          isSubmit
        />
      </FormContainer>
    </Container>
  );
};
