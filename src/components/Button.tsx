import styled from "styled-components";
import { colors } from "../colors";
import { Show } from "./Show";

export type ButtonStyles = "primary" | "secondary" | "warn";

const Primary = styled.button`
  width: 80%;
  height: 2.5rem;
  background-color: ${colors.lime};
  color: ${colors.darkNavy};
  border: none;
  border-radius: 0.35rem;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 1rem;
  font-weight: 500;
  margin: 0.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  transform: scale(1);

  &:hover {
    transform: scale(1.025);
  }
`;

const Secondary = styled(Primary)`
  width: 80%;
  height: 2.5rem;
  background: transparent;
  color: ${colors.white};
  text-decoration: underline;
  transition: none;
  transform: none;

  &:hover {
    transform: none;
  }
`;

const Warn = styled(Primary)`
  background-color: ${colors.red};
  color: ${colors.white};
`;

export type ButtonProps = {
  label: string;
  type: ButtonStyles;
  onClick?: () => void;
  disabled?: boolean;
};

export const Button = (props: ButtonProps) => {
  const { label, type, onClick, disabled } = props;
  return (
    <>
      <Show when={type === "primary"}>
        <Primary disabled={disabled} onClick={onClick}>
          {label}
        </Primary>
      </Show>
      <Show when={type === "secondary"}>
        <Secondary disabled={disabled} onClick={onClick}>
          {label}
        </Secondary>
      </Show>
      <Show when={type === "warn"}>
        <Warn disabled={disabled} onClick={onClick}>
          {label}
        </Warn>
      </Show>
    </>
  );
};
