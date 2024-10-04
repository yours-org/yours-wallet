import { useState } from 'react';
import styled from 'styled-components';
import { Theme } from '../theme.types';
import { HeaderText, Text } from './Reusable';
import { Show } from './Show';
import { isBSV20v2 } from '../utils/ordi';
import { BSV20Id } from './BSV20Id';

const Container = styled.div<{ color: string; $clickable: string }>`
  display: flex;
  flex-direction: column;
  background-color: ${(props) => props.color};
  width: 80%;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin: 0.25rem;
  cursor: ${(props) => (props.$clickable === 'true' ? 'pointer' : 'default')};
`;

const RowContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-direction: row;
  width: 100%;
  margin: 0 0;
  margin-top: 0.4rem;
  padding: 0 0;
`;

const SymContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: start;
  flex-direction: row;
  max-width: calc(50%);
  width: fit-content;
  margin: 0 0;
  padding: 0 0;
`;

const Tick = styled(HeaderText)`
  font-size: 0.9rem;
  text-align: left;
  max-width: 5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 0;
`;

const Amount = styled(Text)`
  font-size: 1rem;
  margin: 0 0rem;
  text-align: right;
  width: fit-content;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TokenIcon = styled.img`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  object-fit: cover;
  margin: 0 0;
  margin-right: 1rem;
`;

export type BSV20ItemProps = {
  theme: Theme;
  id: string;
  name: string;
  amount: string;
  iconUrl: string | null;
  selected?: boolean;
  onClick?: () => void;
  onCopyTokenId: () => void;
};

export const BSV20Item = (props: BSV20ItemProps) => {
  const { id, iconUrl, name, amount, theme, onClick, onCopyTokenId } = props;

  const [containerColor, setContainerColor] = useState(theme.color.global.row);

  return (
    <Container
      color={containerColor}
      onMouseEnter={() => (onClick ? setContainerColor(theme.color.global.row + '99') : undefined)}
      onMouseLeave={() => setContainerColor(theme.color.global.row)}
      onClick={onClick}
      $clickable={onClick ? 'true' : 'false'}
    >
      <RowContainer color={containerColor}>
        <SymContainer>
          <Show when={!!iconUrl && iconUrl.length > 0}>
            <TokenIcon src={iconUrl as string} />
          </Show>
          <Tick theme={theme}>{name}</Tick>
        </SymContainer>
        <Amount theme={theme}>{amount}</Amount>
      </RowContainer>

      <Show when={isBSV20v2(id)}>
        <BSV20Id theme={theme} id={id} onCopyTokenId={onCopyTokenId}></BSV20Id>
      </Show>
    </Container>
  );
};
