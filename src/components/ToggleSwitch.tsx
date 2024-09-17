import styled from 'styled-components';
import { ChangeEvent } from 'react';
import { ColorThemeProps, Theme } from '../theme.types';

const Label = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
`;

const Switch = styled.div<ColorThemeProps>`
  position: relative;
  width: 2rem;
  height: 1rem;
  background: ${({ theme }) => theme.white + '30'};
  border-radius: 2rem;
  padding: 0.25rem;
  transition: 300ms all;

  &:before {
    transition: 300ms all;
    content: '';
    position: absolute;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 2.1875rem;
    top: 50%;
    left: 0rem;
    background: ${({ theme }) => theme.white};
    transform: translate(0, -50%);
  }
`;

const Input = styled.input<ColorThemeProps>`
  opacity: 0;
  position: absolute;

  &:checked + ${Switch} {
    background: ${({ theme }) => theme.primaryButton + '95'};

    &:before {
      transform: translate(1.25rem, -50%);
    }
  }
`;

export type ToggleSwitchProps = {
  on: boolean;
  theme: Theme;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
};

export const ToggleSwitch = (props: ToggleSwitchProps) => {
  const { on, theme } = props;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (props.onChange) {
      props.onChange(e);
    }
  };

  return (
    <Label>
      <Input checked={on} type="checkbox" onChange={handleChange} theme={theme} />
      <Switch theme={theme} />
    </Label>
  );
};
