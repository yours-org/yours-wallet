import { useBlockHeightTracker } from '../hooks/useBlockHeightTracker';
import { Show } from './Show';
import ProgressBar from '@ramonak/react-progress-bar';
import { useTheme } from '../hooks/useTheme';
import { styled } from 'styled-components';
import { ColorThemeProps } from '../theme';
import { YoursLogo } from './Reusable';
import yoursLogo from '../assets/yours-logo.png';

const Container = styled.div<ColorThemeProps>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: ${({ theme }) => theme.black};
  z-index: 1000;
  position: absolute;
`;

const Title = styled.h1<ColorThemeProps>`
  text-align: center;
  width: 100%;
  color: ${({ theme }) => theme.white};
  margin: 0 0 1rem 0;
`;

const Description = styled.p<ColorThemeProps>`
  text-align: center;
  width: 80%;
  margin: -0.5rem 0 1rem 0;
  color: ${({ theme }) => theme.gray};
`;

export const SyncingBlocks = () => {
  const { theme } = useTheme();
  const { percentCompleted, showSyncPage } = useBlockHeightTracker();

  return (
    <Show when={showSyncPage}>
      {percentCompleted !== 100 && (
        <Container theme={theme}>
          <YoursLogo src={yoursLogo} />
          <Title theme={theme}>Syncing Blocks...</Title>
          <Description theme={theme}>Yours SPV Wallet will be ready to use once this process is complete.</Description>
          <ProgressBar
            completed={percentCompleted}
            bgColor={theme.primaryButton}
            baseBgColor="#f5f5f5"
            height="16px"
            width="80vw"
          />
        </Container>
      )}
    </Show>
  );
};
