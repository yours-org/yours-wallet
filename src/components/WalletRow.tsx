import { useState } from 'react';
import { styled } from 'styled-components';
import { useTheme } from '../hooks/useTheme';

const Container = styled.div<{ color: string }>`
  display: flex;
  align-items: center;
  background-color: ${(props) => props.color};
  border-radius: 0.5rem;
  padding: 0.5rem;
  padding-left: 1rem;
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
  const [containerColor, setContainerColor] = useState(theme.color.global.row);
  return (
    <Container
      key={window.crypto.randomUUID()}
      color={containerColor}
      onMouseEnter={() => setContainerColor(theme.color.global.contrast + '10')}
      onMouseLeave={() => setContainerColor(theme.color.global.row)}
      theme={theme}
      onClick={onClick}
    >
      {element}
    </Container>
  );
};
