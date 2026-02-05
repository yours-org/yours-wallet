import styled from 'styled-components';
import { WhiteLabelTheme, Theme } from '../theme.types';
import { Text } from './Reusable';
import { IconButton } from './IconButton';
import copyIcon from '../assets/copy.svg';

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0 0;
  margin-top: 0.4rem;
  padding: 0 0;
`;

const TokenId = styled(Text)<WhiteLabelTheme>`
  font-size: 0.85rem;
  max-width: 16rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 0;
  width: fit-content;
  color: ${({ theme }) => theme.color.global.gray};
  cursor: pointer;
`;

export type BSV21IdProps = {
  theme: Theme;
  id: string;
  onCopyTokenId: () => void;
};

function showId(id: string) {
  return id.substring(0, 5) + '...' + id.substring(id.length - 6);
}

export const BSV21Id = (props: BSV21IdProps) => {
  const { id, theme, onCopyTokenId } = props;

  const copy = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    onCopyTokenId();
  };
  return (
    <Container onClick={copy}>
      <IconButton icon={copyIcon} onClick={(e) => copy(e)}></IconButton>
      <TokenId theme={theme} title={id}>
        {showId(id)}
      </TokenId>
    </Container>
  );
};
