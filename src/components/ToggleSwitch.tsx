import styled from "styled-components";
import { ChangeEvent } from "react";
import { Theme } from "../theme";

const Label = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
`;

const Switch = styled.div`
  position: relative;
  width: 60px;
  height: 28px;
  background: #b3b3b3;
  border-radius: 32px;
  padding: 4px;
  transition: 300ms all;

  &:before {
    transition: 300ms all;
    content: "";
    position: absolute;
    width: 28px;
    height: 28px;
    border-radius: 35px;
    top: 50%;
    left: 4px;
    background: white;
    transform: translate(0, -50%);
  }
`;

const Input = styled.input`
  opacity: 0;
  position: absolute;

  &:checked + ${Switch} {
    background: green;

    &:before {
      transform: translate(32px, -50%);
    }
  }
`;

export type ToggleSwitchProps = {
  on: boolean;
  label: string;
  onLabel: string;
  offLabel: string;
  theme: Theme;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
};

export const ToggleSwitch = (props: ToggleSwitchProps) => {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (props.onChange) {
      props.onChange(e);
    }
  };

  return (
    <Label>
      <span>
        {props.label}: {props.on ? props.onLabel : props.offLabel}
      </span>
      <Input checked={props.on} type="checkbox" onChange={handleChange} />
      <Switch />
    </Label>
  );
};
