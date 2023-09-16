import styled from "styled-components";
import { DescText } from "./Reusable";
import { SnackbarType } from "../contexts/SnackbarContext";
import { colors } from "../colors";

export const SnackBarContainer = styled.div<{ color?: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 80%;
  height: 2.5rem;
  position: absolute;
  bottom: 1.75rem;
  background-color: ${(props) => props.color};
  color: ${colors.white};
`;

export type SnackbarProps = {
  message: string;
  type: SnackbarType | null;
};

export const Snackbar = (props: SnackbarProps) => {
  const { message, type } = props;
  return (
    <SnackBarContainer
      color={
        type === "error"
          ? colors.red
          : type === "info"
          ? colors.seaFoam
          : colors.lime
      }
    >
      <DescText style={{ margin: 0 }}>{message}</DescText>
    </SnackBarContainer>
  );
};
