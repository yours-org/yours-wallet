import { useState } from 'react';
import styled from 'styled-components';
import { Theme } from '../theme';
import { GP_BASE_URL } from '../utils/constants';
import { HeaderText, Text } from './Reusable';
import { Show } from './Show';

const Container = styled.div<{ color: string; $clickable: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${(props) => props.color};
  width: 80%;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin: 0.25rem;
  cursor: ${(props) => (props.$clickable === 'true' ? 'pointer' : 'default')};
`;

const Tick = styled(HeaderText)`
  font-size: 0.9rem;
  width: 50%;
  text-align: left;
`;

const Amount = styled(Text)`
  font-size: 1rem;
  margin: 0 1rem;
  text-align: right;
`;

const TokenIcon = styled.img`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  object-fit: cover;
  margin-right: 0.5rem;
`;

export type BSV20ItemProps = {
  theme: Theme;
  name: string;
  amount: string;
  iconOrigin?: string | null;
  selected?: boolean;
  onClick?: () => void;
};

export const BSV20Item = (props: BSV20ItemProps) => {
  const { iconOrigin, name, amount, theme, onClick } = props;

  const [containerColor, setContainerColor] = useState(theme.darkAccent);

  return (
    <Container
      color={containerColor}
      onMouseEnter={() => (onClick ? setContainerColor(theme.darkAccent + '99') : undefined)}
      onMouseLeave={() => setContainerColor(theme.darkAccent)}
      onClick={onClick}
      $clickable={onClick ? 'true' : 'false'}
    >
      <Show when={!!iconOrigin && iconOrigin.length > 0}>
        <TokenIcon src={`${GP_BASE_URL}/content/${iconOrigin}`} />
      </Show>
      <Tick theme={theme}>{name}</Tick>
      <Amount theme={theme}>{amount}</Amount>
    </Container>
  );
};
