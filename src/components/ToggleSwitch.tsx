import styled from 'styled-components';
import { ChangeEvent } from 'react';
import { WhiteLabelTheme, Theme } from '../theme.types';

const Label = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
`;

const Switch = styled.div<WhiteLabelTheme>`
  position: relative;
  width: 2rem;
  height: 1rem;
  background: ${({ theme }) =>
    theme.color.global.primaryTheme === 'light'
      ? theme.color.global.neutral + '30'
      : theme.color.global.contrast + '30'};
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
    background: ${({ theme }) => (theme.color.global.primaryTheme === 'light' ? theme.color.global.neutral + '30' : theme.color.global.contrast + '30')};};
    transform: translate(0, -50%);
  }
`;

const Input = styled.input<WhiteLabelTheme>`
  opacity: 0;
  position: absolute;

  &:checked + ${Switch} {
    background: ${({ theme }) => theme.color.component.toggleSwitchOn};

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
