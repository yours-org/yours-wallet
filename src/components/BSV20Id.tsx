import styled from 'styled-components';
import { Theme } from '../theme';
import { Text } from './Reusable';
import { IconButton } from './IconButton';
import copy from '../assets/copy.svg';

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-direction: row;
  width: 100%;
  margin: 0 0;
  margin-top: 0.4rem;
  padding: 0 0;
`;

const TokenId = styled(Text)`
  font-size: 1rem;
  max-width: 16rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 0;
  width: fit-content;
`;

export type BSV20IdProps = {
  theme: Theme;
  id: string;
  onCopyTokenId: () => void;
};

function showId(id: string) {
  return id.substring(0, 5) + '...' + id.substring(id.length - 6);
}

export const BSV20Id = (props: BSV20IdProps) => {
  const { id, theme, onCopyTokenId } = props;

  return (
    <Container>
      <TokenId theme={theme} title={id}>
        {showId(id)}
      </TokenId>
      <IconButton
        icon={copy}
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(id);
          onCopyTokenId();
        }}
      ></IconButton>
    </Container>
  );
};
