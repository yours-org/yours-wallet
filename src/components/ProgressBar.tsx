import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useTheme } from '../hooks/useTheme';
import { ColorThemeProps } from '../theme';

const ProgressBarContainer = styled.div<ColorThemeProps>`
  width: 100%;
  background-color: ${({ theme }) => theme.primaryButton + 20};
  border-radius: 1rem;
  margin: 0.5rem 0;
`;

const Progress = styled.div<{ $progress: number; $barColor: string }>`
  width: ${({ $progress }) => $progress}%;
  background-color: ${({ $barColor }) => $barColor};
  height: 1rem;
  border-radius: 1rem;
  transition: width 1s ease-in-out;
`;

type ProgressBarProps = {
  progress: number;
  barColor: string;
};

const ProgressBar = ({ progress, barColor }: ProgressBarProps) => {
  const { theme } = useTheme();
  const [internalProgress, setInternalProgress] = useState(0);

  useEffect(() => {
    // Set a small delay to ensure the initial width change is triggered
    const timeoutId = setTimeout(() => {
      setInternalProgress(progress);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [progress]);

  return (
    <ProgressBarContainer theme={theme}>
      <Progress $progress={internalProgress} $barColor={barColor} />
    </ProgressBarContainer>
  );
};

export default ProgressBar;
