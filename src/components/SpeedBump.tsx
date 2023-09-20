import { ButtonContainer, HeaderText, Text } from "./Reusable";
import { Button } from "./Button";
import { Show } from "./Show";
import { colors } from "../colors";
import { styled } from "styled-components";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 22.5rem;
  height: 33.75rem;
  margin: 0;
  background-color: ${colors.darkNavy};
  color: ${colors.white};
  z-index: 100;
`;

export type SpeedBumpProps = {
  message: string;
  showSpeedBump: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const SpeedBump = (props: SpeedBumpProps) => {
  const { message, onCancel, onConfirm, showSpeedBump } = props;

  return (
    <Show when={showSpeedBump}>
      <Container>
        <HeaderText>Are you sure?</HeaderText>
        <Text>{message}</Text>
        <ButtonContainer>
          <Button type="warn" label="Confirm" onClick={onConfirm} />
          <Button type="primary" label="Cancel" onClick={onCancel} />
        </ButtonContainer>
      </Container>
    </Show>
  );
};
