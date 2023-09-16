import styled from "styled-components";
import arrow from "../assets/left-arrow.svg";

export const Image = styled.img`
  width: 1.5rem;
  height: 1.5rem;
  position: absolute;
  top: 1.5rem;
  left: 1.5rem;
  cursor: pointer;
`;

export type BackButtonProps = {
  onClick: () => void;
};

export const BackButton = (props: BackButtonProps) => {
  const { onClick } = props;
  return <Image src={arrow} onClick={onClick} />;
};
