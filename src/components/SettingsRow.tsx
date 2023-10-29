import { styled } from 'styled-components';
import { useTheme } from '../hooks/useTheme';
import { HeaderText, Text } from './Reusable';
import { useState } from 'react';
import { Show } from './Show';

const Container = styled.div<{ color: string; $clickable: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${(props) => props.color};
  width: 80%;
  padding: 0.5rem;
  border-radius: 0.5rem;
  margin: 0.25rem;
  cursor: ${(props) => (props.$clickable === 'true' ? 'pointer' : 'default')};
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
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
  onClick?: () => void;
};

export const SettingsRow = (props: SettingsRowProp) => {
  const { name, description, onClick, jsxElement } = props;
  const { theme } = useTheme();
  const [containerColor, setContainerColor] = useState(theme.darkAccent);

  return (
    <Container
      color={containerColor}
      onMouseEnter={() => (onClick ? setContainerColor(theme.darkAccent + '99') : undefined)}
      onMouseLeave={() => setContainerColor(theme.darkAccent)}
      onClick={onClick}
      $clickable={onClick ? 'true' : 'false'}
    >
      <Content>
        <SettingName theme={theme}>{name}</SettingName>
        <Description theme={theme}>{description}</Description>
      </Content>
      <Show when={!!jsxElement}>{jsxElement}</Show>
    </Container>
  );
};
