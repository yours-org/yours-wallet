import { useState } from 'react';
import { styled } from 'styled-components';
import { useKeys } from '../hooks/useKeys';
import { useTheme } from '../hooks/useTheme';
import { useViewport } from '../hooks/useViewport';
import { ColorThemeProps } from '../theme';
import { sleep } from '../utils/sleep';
import { storage } from '../utils/storage';
import { Button } from './Button';
import { Input } from './Input';
import yoursLogo from '../assets/yours-logo.png';
import { FormContainer, HeaderText, Text, YoursLogo } from './Reusable';

const Container = styled.div<ColorThemeProps & { $isMobile: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: ${(props) => (props.$isMobile ? '100vw' : '22.5rem')};
  height: ${(props) => (props.$isMobile ? '100vh' : '33.75rem')};
  margin: 0;
  background-color: ${({ theme }) => theme.mainBackground};
  color: ${({ theme }) => theme.white};
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

  const { verifyPassword } = useKeys();

  const handleUnlock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);
    const isVerified = await verifyPassword(password);
    if (isVerified) {
      setVerificationFailed(false);
      const timestamp = Date.now();
      storage.set({ lastActiveTime: timestamp });
      onUnlock();
    } else {
      setVerificationFailed(true);
      setPassword('');
      setTimeout(() => {
        setVerificationFailed(false);
        setIsProcessing(false);
      }, 900);
    }
  };

  return (
    <Container $isMobile={isMobile} theme={theme}>
      <YoursLogo src={yoursLogo} />
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
        />
        <Button
          theme={theme}
          type="secondary-outline"
          label={isProcessing ? 'Unlocking...' : 'Unlock'}
          disabled={isProcessing}
          isSubmit
        />
      </FormContainer>
    </Container>
  );
};
