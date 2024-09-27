import { useTheme } from '../hooks/useTheme';
import { styled, keyframes } from 'styled-components';
import { WhiteLabelTheme } from '../theme.types';
import { YoursIcon } from './YoursIcon';
import { Button } from './Button';

const slideIn = keyframes`
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
`;

const Container = styled.div<WhiteLabelTheme>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: ${({ theme }) => theme.color.global.walletBackground};
  z-index: 1000;
  position: absolute;
  animation: ${slideIn} 1s;
`;

const Title = styled.h1<WhiteLabelTheme>`
  text-align: center;
  width: 100%;
  color: ${({ theme }) =>
    theme.color.global.primaryTheme === 'dark' ? theme.color.global.contrast : theme.color.global.neutral};
  margin: 0 0 1rem 0;
`;

const Description = styled.p<WhiteLabelTheme>`
  text-align: center;
  width: 80%;
  margin: -0.5rem 0 1rem 0;
  color: ${({ theme }) => theme.color.global.gray};
`;

export type UpradeNotificationProps = {
  onSync: () => void;
};

export const UpgradeNotification = ({ onSync }: UpradeNotificationProps) => {
  const { theme } = useTheme();

  return (
    <Container theme={theme}>
      <YoursIcon width="4rem" />
      <Title theme={theme}>Major Update!</Title>
      <Description theme={theme}>
        Version 4.0 introduces a number of new features including "Simplified Payment Verification" (SPV). To get
        started, please start the sync process.
      </Description>
      <Button theme={theme} type="secondary-outline" label="Sync SPV Wallet" onClick={onSync} />
    </Container>
  );
};
