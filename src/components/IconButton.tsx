import styled from 'styled-components';

export const Image = styled.img`
  width: 1.25rem;
  height: 1.25rem;
  top: 1.5rem;
  left: 1.5rem;
  cursor: pointer;
`;

export type IconButtonProps = {
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
  icon: string;
};

export const IconButton = (props: IconButtonProps) => {
  const { onClick, icon } = props;
  return <Image src={icon} onClick={onClick} />;
};
