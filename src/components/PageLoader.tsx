import styled, { keyframes } from 'styled-components';
import { ColorThemeProps, Theme } from '../theme';
import { Text } from './Reusable';
import { Show } from './Show';
import ProgressBar from '@ramonak/react-progress-bar';
import { YoursIcon } from './YoursIcon';

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

export const LoaderContainer = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  height: 100%;
  width: 100%;
  top: 0;
  left: 0;
  z-index: 9999;
`;

const ProgressBarContainer = styled.div`
  width: 80%;
  border-radius: 1rem;
  margin: 0.25rem 0;
`;

export const Loader = styled.div<ColorThemeProps>`
  border: 0.5rem solid ${({ theme }) => theme.white + '50'};
  border-top: 0.5rem solid ${({ theme }) => theme.lightAccent};
  border-radius: 50%;
  width: 2rem;
  height: 2rem;
  animation: ${spin} 1s linear infinite;
`;

export type PageLoaderProps = {
  theme: Theme;
  message?: string;
  showProgressBar?: boolean;
  barProgress?: number;
};

export const PageLoader = (props: PageLoaderProps) => {
  const { message, theme, showProgressBar = false, barProgress = 0 } = props;
  return (
    <LoaderContainer>
      <YoursIcon width="3.5rem" />
      <Text theme={theme} style={{ fontSize: '1rem', color: theme.white }}>
        {message}
      </Text>
      <Show when={showProgressBar && barProgress > 0} whenFalseContent={<Loader theme={theme} />}>
        <ProgressBarContainer>
          <ProgressBar completed={barProgress} bgColor={theme.primaryButton} baseBgColor={'#f5f5f5'} height="16px" />
        </ProgressBarContainer>
      </Show>
    </LoaderContainer>
  );
};
