import styled from "styled-components";
import { ColorThemeProps, Theme } from "../theme";
import { Show } from "./Show";

export type ButtonStyles = "primary" | "secondary" | "warn";

const Primary = styled.button<ColorThemeProps>`
  width: 80%;
  height: 2.5rem;
  background-color: ${({ theme }) => theme.primaryButton};
  color: ${({ theme }) => theme.mainBackground};
  border: none;
  border-radius: 0.35rem;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 1rem;
  font-weight: 500;
  margin: 0.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  transform: scale(1);

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    background-color: ${({ theme }) => theme.primaryButton + "40"};
  }

  &:hover {
    transform: scale(1.025);
  }
`;

const Secondary = styled(Primary)`
  width: 80%;
  height: 2.5rem;
  background: transparent;
  color: ${({ theme }) => theme.white};
  text-decoration: underline;
  transition: none;
  transform: none;

  &:disabled {
    background: transparent;
    color: ${({ theme }) => theme.white + "40"};
  }

  &:hover {
    transform: none;
  }
`;

const Warn = styled(Primary)`
  background-color: ${({ theme }) => theme.errorRed};
  color: ${({ theme }) => theme.white};

  &:disabled {
    background-color: ${({ theme }) => theme.errorRed + "40"};
  }
`;

export type ButtonProps = {
  label: string;
  type: ButtonStyles;
  theme: Theme;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  isSubmit?: boolean;
};

export const Button = (props: ButtonProps) => {
  const { label, type, onClick, disabled, theme, isSubmit } = props;
  return (
    <>
      <Show when={type === "primary"}>
        <Primary
          theme={theme}
          disabled={disabled}
          onClick={onClick}
          type={isSubmit ? "submit" : "button"}
        >
          {label}
        </Primary>
      </Show>
      <Show when={type === "secondary"}>
        <Secondary
          theme={theme}
          disabled={disabled}
          onClick={onClick}
          type={isSubmit ? "submit" : "button"}
        >
          {label}
        </Secondary>
      </Show>
      <Show when={type === "warn"}>
        <Warn
          theme={theme}
          disabled={disabled}
          onClick={onClick}
          type={isSubmit ? "submit" : "button"}
        >
          {label}
        </Warn>
      </Show>
    </>
  );
};
