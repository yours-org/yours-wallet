import { useState } from 'react';
import { styled } from 'styled-components';
import { useTheme } from '../hooks/useTheme';

const Container = styled.div<{ color: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.color};
  border-radius: 0.5rem;
  padding: 0.5rem;
  margin: 0.25rem;
  width: 80%;
  min-height: 2rem;
  cursor: pointer;
`;

export type WalletRowTypes = {
  element: JSX.Element;
  onClick: () => void;
};

export const WalletRow = (props: WalletRowTypes) => {
  const { element, onClick } = props;
  const { theme } = useTheme();
  const [containerColor, setContainerColor] = useState(theme.darkAccent);
  return (
    <Container
      key={window.crypto.randomUUID()}
      color={containerColor}
      onMouseEnter={() => setContainerColor(theme.darkAccent + '99')}
      onMouseLeave={() => setContainerColor(theme.darkAccent)}
      theme={theme}
      onClick={onClick}
    >
      {element}
    </Container>
  );
};
