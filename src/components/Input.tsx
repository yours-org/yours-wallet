import styled from "styled-components";
import { colors } from "../colors";
import { InputHTMLAttributes } from "react";

const TheInput = styled.input`
  background-color: ${colors.darkNavy};
  border-radius: 0.25rem;
  border: 1px solid ${colors.offWhite};
  width: 80%;
  height: 2rem;
  padding-left: 0.5rem;
  margin: 0.5rem;
  outline: none;
  color: ${colors.offWhite};

  &::placeholder {
    color: ${colors.offWhite};
  }

  /* &:focus {
    outline: none;
  } */
`;

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = (props: InputProps) => {
  const { ...allProps } = props;
  return <TheInput {...allProps} />;
};
