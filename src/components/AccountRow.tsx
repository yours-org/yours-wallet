import { styled } from 'styled-components';
import { useTheme } from '../hooks/useTheme';
import { HeaderText } from './Reusable';
import { useState } from 'react';
import { Show } from './Show';

const Container = styled.div<{ color: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${(props) => props.color};
  width: 85%;
  padding: 0.5rem;
  border-radius: 0.5rem;
  margin: 0.25rem;
  cursor: pointer;
`;

const Content = styled.div`
  display: flex;
  align-items: center;
`;

const AccountName = styled(HeaderText)`
  font-size: 1rem;
  text-align: left;
  width: 100%;
`;

const Icon = styled.img`
  width: 2rem;
  height: 2rem;
  margin-right: 0.5rem;
  border-radius: 50%;
`;

export type AccountRowProps = {
  name: string;
  icon: string;
  jsxElement?: JSX.Element;
  onClick: () => void;
};

export const AccountRow = (props: AccountRowProps) => {
  const { name, icon, onClick, jsxElement } = props;
  const { theme } = useTheme();
  const [containerColor, setContainerColor] = useState(theme.color.global.row);

  return (
    <Container
      color={containerColor}
      onMouseEnter={() => setContainerColor(theme.color.global.row + '99')}
      onMouseLeave={() => setContainerColor(theme.color.global.row)}
      onClick={onClick}
    >
      <Content>
        <Icon src={icon} />
        <AccountName theme={theme}>{name}</AccountName>
      </Content>
      <Show when={!!jsxElement}>{jsxElement}</Show>
    </Container>
  );
};
