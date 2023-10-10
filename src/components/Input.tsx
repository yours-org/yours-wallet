import styled, { keyframes, css } from "styled-components";
import { Theme } from "../theme";
import { InputHTMLAttributes } from "react";

const $shakeAnimation = keyframes`
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

const TheInput = styled.input<{ theme: Theme; $shake?: string }>`
  background-color: ${({ theme }) => theme.darkAccent + "60"};
  border-radius: 0.25rem;
  border: 1px solid ${({ theme }) => theme.white + "40"};
  width: 80%;
  height: 2rem;
  padding-left: 0.5rem;
  margin: 0.5rem;
  outline: none;
  color: ${({ theme }) => theme.white + "80"};
  animation: ${(props) =>
    props.$shake === "true"
      ? css`
          ${$shakeAnimation} 0.5s cubic-bezier(.36,.07,.19,.97) both
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
    color: ${({ theme }) => theme.white + "80"};
  }
`;

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  theme: Theme;
  shake?: string;
};

export const Input = (props: InputProps) => {
  const { shake = "false", theme, ...allProps } = props;

  const preventScroll = (e: any) => {
    e.target.blur();
    e.stopPropagation();
    setTimeout(() => {
      e.target.focus();
    }, 0);
  };

  return (
    <TheInput
      {...allProps}
      theme={theme}
      onWheel={preventScroll}
      $shake={shake}
    />
  );
};
