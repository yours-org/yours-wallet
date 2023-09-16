import styled from "styled-components";
import { DescText } from "./Reusable";
import { SnackbarType } from "../contexts/SnackbarContext";
import { colors } from "../colors";

export const SnackBarContainer = styled.div<{ color?: string }>`
  width: 80%;
  height: 2.5rem;
  position: absolute;
  bottom: 1.5rem;
  color: ${(props) => props.color};
  border-radius: 0.5rem;
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
      <DescText>{message}</DescText>
    </SnackBarContainer>
  );
};
