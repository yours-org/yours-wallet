import styled from "styled-components";
import { colors } from "../colors";
import { InputHTMLAttributes } from "react";

const TheInput = styled.input`
  background-color: ${colors.darkNavy};
  border-radius: 0.25rem;
  border: 1px solid ${colors.white + "50"};
  width: 80%;
  height: 2rem;
  padding-left: 0.5rem;
  margin: 0.5rem;
  outline: none;
  color: ${colors.white + "80"};

  &[type="number"]::-webkit-inner-spin-button,
  &[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type="number"] {
    -moz-appearance: textfield; /* Firefox */
  }

  &::placeholder {
    color: ${colors.white + "80"};
  }
`;

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = (props: InputProps) => {
  const { ...allProps } = props;

  const preventScroll = (e: any) => {
    e.target.blur();
    e.stopPropagation();
    setTimeout(() => {
      e.target.focus();
    }, 0);
  };

  return <TheInput {...allProps} onWheel={preventScroll} />;
};
