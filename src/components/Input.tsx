import { InputHTMLAttributes } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { Theme } from '../theme.types';

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
  background-color: ${({ theme }) => theme.color.global.gray + '10'};
  border-radius: 0.25rem;
  border: 1px solid ${({ theme }) => theme.color.global.gray + '50'};
  font-size: 0.85rem;
  width: 85%;
  height: 2rem;
  padding-left: 0.5rem;
  margin: 0.25rem;
  outline: none;
  text-indent: 0.5rem;
  color: ${({ theme }) => theme.color.global.contrast + '80'};
  animation: ${(props) =>
    props.$shake === 'true'
      ? css`
          ${$shakeAnimation} 0.5s cubic-bezier(.36,.07,.19,.97) both
        `
      : 'none'};

  &[type='number']::-webkit-inner-spin-button,
  &[type='number']::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type='number'] {
    -moz-appearance: textfield; /* Firefox */
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.global.gray};
  }
`;

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  theme: Theme;
  shake?: string;
};

export const Input = (props: InputProps) => {
  const { shake = 'false', theme, ...allProps } = props;

  const preventScroll = (e: React.WheelEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).blur();
    e.stopPropagation();
    setTimeout(() => {
      (e.target as HTMLInputElement).focus();
    }, 0);
  };

  return <TheInput {...allProps} theme={theme} onWheel={preventScroll} $shake={shake} />;
};
