import { FaChevronRight } from 'react-icons/fa';
import styled from 'styled-components';

export const Image = styled.img`
  width: 1.25rem;
  height: 1.25rem;
  top: 1.5rem;
  left: 1.5rem;
  cursor: pointer;
`;

export type ForwardButtonProps = {
  color: string;
  onClick?: () => void;
};

export const ForwardButton = (props: ForwardButtonProps) => {
  const { color, onClick } = props;
  return <FaChevronRight color={color} onClick={onClick} />;
};
