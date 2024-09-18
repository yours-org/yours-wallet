import { useBlockHeightTracker } from '../hooks/useBlockHeightTracker';
import { Show } from './Show';
import ProgressBar from '@ramonak/react-progress-bar';
import { useTheme } from '../hooks/useTheme';
import { styled } from 'styled-components';
import { WhiteLabelTheme } from '../theme.types';
import { YoursIcon } from './YoursIcon';

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
`;

const Title = styled.h1<WhiteLabelTheme>`
  text-align: center;
  width: 100%;
  color: ${({ theme }) =>
    theme.color.global.primaryTheme === 'dark' ? theme.color.global.white : theme.color.global.black};
  margin: 0 0 1rem 0;
`;

const Description = styled.p<WhiteLabelTheme>`
  text-align: center;
  width: 80%;
  margin: -0.5rem 0 1rem 0;
  color: ${({ theme }) => theme.color.global.gray};
`;

export const SyncingBlocks = () => {
  const { theme } = useTheme();
  const { percentCompleted, showSyncPage } = useBlockHeightTracker();

  return (
    <Show when={showSyncPage}>
      {percentCompleted !== 100 && (
        <Container theme={theme}>
          <YoursIcon width="4rem" />
          <Title theme={theme}>Syncing Blocks...</Title>
          <Description theme={theme}>Yours SPV Wallet will be ready to use once this process is complete.</Description>
          <ProgressBar
            completed={percentCompleted}
            bgColor={theme.color.component.progressBar}
            baseBgColor={theme.color.component.progressBarTrack}
            height="16px"
            width="80vw"
          />
        </Container>
      )}
    </Show>
  );
};
