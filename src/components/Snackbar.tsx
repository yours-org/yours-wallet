import styled from "styled-components";
import { DescText } from "./Reusable";
import { SnackbarType } from "../contexts/SnackbarContext";
import { colors } from "../colors";
import errorIcon from "../assets/error.svg";
import infoIcon from "../assets/info.svg";
import successIcon from "../assets/success.svg";

export const SnackBarContainer = styled.div<{ color?: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
  height: 100%;
  position: absolute;
  margin: 0;
  background-color: ${(props) => props.color};
  color: ${colors.white};
  z-index: 100;
  opacity: 0.98;
`;

const Image = styled.img`
  width: 2rem;
  height: 2rem;
  margin: 1rem;
`;

export type SnackbarProps = {
  /** The message that should be displayed on the snackbar */
  message: string;
  /** The type of snackbar. success | error | info */
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
      <Image
        src={
          type === "error"
            ? errorIcon
            : type === "info"
            ? infoIcon
            : successIcon
        }
      />
      <DescText
        style={{
          margin: 0,
          fontWeight: 500,
          fontSize: "1.25rem",
          color: type === "error" ? colors.white : colors.darkNavy,
        }}
      >
        {message}
      </DescText>
    </SnackBarContainer>
  );
};
