import { styled } from 'styled-components';
import { useTheme } from '../hooks/useTheme';
import { HeaderText, Text } from './Reusable';
import { useState } from 'react';
import { Show } from './Show';
import ProgressBar from '@ramonak/react-progress-bar';

const Container = styled.div<{ color: string; $clickable: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${(props) => props.color};
  width: 85%;
  padding: 1rem;
  border-radius: 0.5rem;
  min-height: 3.5rem;
  margin: 0.25rem;
  cursor: ${(props) => (props.$clickable === 'true' ? 'pointer' : 'default')};
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  border-radius: 1rem;
  margin: 0.5rem 0;
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
`;

const SettingName = styled(HeaderText)`
  font-size: 1rem;
  text-align: left;
  width: 100%;
`;

const Description = styled(Text)`
  font-size: 0.75rem;
  text-align: left;
  width: 100%;
  margin: 0;
  color: ${({ theme }) => theme.color.global.gray};
`;

export type SettingsRowProp = {
  name: string;
  description: string;
  jsxElement?: JSX.Element;
  style?: React.CSSProperties;
  onClick?: () => void;
  masterBackupText?: string;
  masterBackupProgress?: number;
};

export const SettingsRow = (props: SettingsRowProp) => {
  const { name, description, onClick, jsxElement, style, masterBackupText, masterBackupProgress } = props;
  const { theme } = useTheme();
  const [containerColor, setContainerColor] = useState(theme.color.global.row);

  const masterBackupContent = (
    <Content>
      <Description theme={theme}>{masterBackupText}</Description>
      {masterBackupProgress && (
        <ProgressBarContainer>
          <ProgressBar
            completed={masterBackupProgress}
            bgColor={theme.color.component.progressBar}
            baseBgColor={theme.color.component.progressBarTrack}
            height="16px"
          />
        </ProgressBarContainer>
      )}
    </Content>
  );

  return (
    <Container
      color={containerColor}
      onMouseEnter={() => (onClick ? setContainerColor(theme.color.global.row + '99') : undefined)}
      onMouseLeave={() => setContainerColor(theme.color.global.row)}
      onClick={onClick}
      $clickable={onClick ? 'true' : 'false'}
      style={style}
    >
      <Show when={!masterBackupText} whenFalseContent={masterBackupContent}>
        <Content>
          <SettingName theme={theme}>{name}</SettingName>
          <Description theme={theme}>{description}</Description>
        </Content>
        <Show when={!!jsxElement}>{jsxElement}</Show>
      </Show>
    </Container>
  );
};
