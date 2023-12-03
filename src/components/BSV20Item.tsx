import styled from 'styled-components';
import { Theme } from '../theme';
import { HeaderText, Text } from './Reusable';
import { useState } from 'react';
import { truncate } from '../utils/format';

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
  font-size: 1rem;
`;

const Amount = styled(Text)`
  font-size: 1rem;
  margin: 0 1rem;
  text-align: right;
`;

export type BSV20ItemProps = {
  theme: Theme;
  name: string;
  amount: string;
  selected?: boolean;
  onClick?: () => void;
};

export const BSV20Item = (props: BSV20ItemProps) => {
  const { name, amount, theme, onClick } = props;

  const [containerColor, setContainerColor] = useState(theme.darkAccent);

  return (
    <Container
      color={containerColor}
      onMouseEnter={() => (onClick ? setContainerColor(theme.darkAccent + '99') : undefined)}
      onMouseLeave={() => setContainerColor(theme.darkAccent)}
      onClick={onClick}
      $clickable={onClick ? 'true' : 'false'}
    >
      <Tick theme={theme}>{name.length > 6 ? truncate(name, 3, 3) : name}</Tick>
      <Amount theme={theme}>{amount}</Amount>
    </Container>
  );
};
