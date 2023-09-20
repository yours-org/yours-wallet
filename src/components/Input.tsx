import styled, { keyframes, css } from "styled-components";
import { colors } from "../colors";
import { InputHTMLAttributes } from "react";

const shakeAnimation = keyframes`
  10%, 90% {
    transform: translate3d(-1px, 0, 0);
  }
  
  20%, 80% {
    transform: translate3d(2px, 0, 0);
  }

  30%, 50%, 70% {
    transform: translate3d(-4px, 0, 0);
  }

  40%, 60% {
    transform: translate3d(4px, 0, 0);
  }
`;

const TheInput = styled.input<{ shake?: string }>`
  background-color: ${colors.darkNavy};
  border-radius: 0.25rem;
  border: 1px solid ${colors.white + "50"};
  width: 80%;
  height: 2rem;
  padding-left: 0.5rem;
  margin: 0.5rem;
  outline: none;
  color: ${colors.white + "80"};
  animation: ${(props) =>
    props.shake === "true"
      ? css`
          ${shakeAnimation} 0.5s cubic-bezier(.36,.07,.19,.97) both
        `
      : "none"};

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

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  shake?: string;
};

export const Input = (props: InputProps) => {
  const { shake = "false", ...allProps } = props;

  const preventScroll = (e: any) => {
    e.target.blur();
    e.stopPropagation();
    setTimeout(() => {
      e.target.focus();
    }, 0);
  };

  return <TheInput {...allProps} onWheel={preventScroll} shake={shake} />;
};
