import styled from 'styled-components';
import rightChevron from '../assets/right-chevron.svg';

export const Image = styled.img`
  width: 1.25rem;
  height: 1.25rem;
  top: 1.5rem;
  left: 1.5rem;
  cursor: pointer;
`;

export type ForwardButtonProps = {
  onClick?: () => void;
};

export const ForwardButton = (props: ForwardButtonProps) => {
  const { onClick } = props;
  return <Image src={rightChevron} onClick={onClick} />;
};
