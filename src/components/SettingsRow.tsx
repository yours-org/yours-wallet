import { styled } from 'styled-components';
import { useTheme } from '../hooks/useTheme';
import { HeaderText, Text } from './Reusable';
import { useState } from 'react';
import { Show } from './Show';
import ProgressBar from './ProgressBar';

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
  const [containerColor, setContainerColor] = useState(theme.darkAccent);

  const masterBackupContent = (
    <Content>
      <Description theme={theme}>{masterBackupText}</Description>
      {masterBackupProgress && <ProgressBar progress={masterBackupProgress || 0} barColor={theme.primaryButton} />}
    </Content>
  );

  return (
    <Container
      color={containerColor}
      onMouseEnter={() => (onClick ? setContainerColor(theme.darkAccent + '99') : undefined)}
      onMouseLeave={() => setContainerColor(theme.darkAccent)}
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
