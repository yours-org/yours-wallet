import { ButtonContainer, HeaderText, Text } from "./Reusable";
import { Button } from "./Button";
import { Show } from "./Show";
import { ColorThemeProps, Theme } from "../theme";
import { styled } from "styled-components";

const Container = styled.div<ColorThemeProps>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 22.5rem;
  height: 33.75rem;
  margin: 0;
  background-color: ${({ theme }) => theme.darkAccent};
  color: ${({ theme }) => theme.white};
  z-index: 100;
`;

export type SpeedBumpProps = {
  message: string;
  showSpeedBump: boolean;
  theme: Theme;
  onCancel: () => void;
  onConfirm: () => void;
};

export const SpeedBump = (props: SpeedBumpProps) => {
  const { message, onCancel, onConfirm, showSpeedBump, theme } = props;

  return (
    <Show when={showSpeedBump}>
      <Container theme={theme}>
        <HeaderText theme={theme}>Are you sure?</HeaderText>
        <Text theme={theme}>{message}</Text>
        <ButtonContainer>
          <Button
            theme={theme}
            type="warn"
            label="Confirm"
            onClick={onConfirm}
          />
          <Button
            theme={theme}
            type="primary"
            label="Cancel"
            onClick={onCancel}
          />
        </ButtonContainer>
      </Container>
    </Show>
  );
};
