import { ButtonContainer, HeaderText, Text } from './Reusable';
import { Button } from './Button';
import { Show } from './Show';
import { ColorThemeProps, Theme } from '../theme';
import { styled } from 'styled-components';
import { Input } from './Input';
import { useState } from 'react';
import { sleep } from '../utils/sleep';
import { useSnackbar } from '../hooks/useSnackbar';
import { useKeys } from '../hooks/useKeys';
import { PageLoader } from './PageLoader';

const Container = styled.div<ColorThemeProps>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 22.5rem;
  height: 33.75rem;
  margin: 0;
  background-color: ${({ theme }) => theme.darkAccent};
  color: ${({ theme }) => theme.white};
  z-index: 100;
`;

export type SpeedBumpProps = {
  message: string;
  showSpeedBump: boolean;
  theme: Theme;
  withPassword?: boolean;
  onCancel: () => void;
  onConfirm: (password?: string) => void;
};

export const SpeedBump = (props: SpeedBumpProps) => {
  const { message, onCancel, onConfirm, showSpeedBump, theme, withPassword = false } = props;

  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { addSnackbar } = useSnackbar();
  const { verifyPassword } = useKeys();

  const handleConfirm = async () => {
    if (!withPassword) {
      onConfirm();
      return;
    }
    try {
      setIsProcessing(true);
      await sleep(25);

      if (!password) {
        addSnackbar('You must enter a password!', 'error');
        return;
      }

      const isVerified = await verifyPassword(password);
      if (!isVerified) {
        addSnackbar('Invalid password!', 'error');
        return;
      }

      onConfirm(password);
    } catch (error) {
      console.log(error);
    } finally {
      setIsProcessing(false);
      setPassword('');
    }
  };

  const mainContent = (
    <>
      <HeaderText theme={theme}>Are you sure?</HeaderText>
      <Text theme={theme}>{message}</Text>
      <Show when={withPassword}>
        <Input
          theme={theme}
          placeholder="Enter Wallet Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Show>
      <ButtonContainer>
        <Button theme={theme} type="warn" label="Confirm" onClick={handleConfirm} />
        <Button theme={theme} type="primary" label="Cancel" onClick={onCancel} />
      </ButtonContainer>
    </>
  );

  return (
    <Show when={showSpeedBump}>
      <Container theme={theme}>
        <Show when={isProcessing} whenFalseContent={mainContent}>
          <PageLoader theme={theme} message="Exporting Keys..." />
        </Show>
      </Container>
    </Show>
  );
};
