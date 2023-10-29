import styled from 'styled-components';
import { Text } from './Reusable';
import { SnackbarType } from '../contexts/SnackbarContext';
import { ColorThemeProps, Theme } from '../theme';
import errorIcon from '../assets/error.svg';
import infoIcon from '../assets/info.svg';
import successIcon from '../assets/success.svg';

type SnackBarColorTheme = ColorThemeProps & { color: string };

export const SnackBarContainer = styled.div<SnackBarColorTheme>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
  height: 100%;
  position: absolute;
  margin: 0;
  background-color: ${({ color }) => color};
  color: ${({ theme }) => theme.white};
  z-index: 200;
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
  theme: Theme;
};

export const Snackbar = (props: SnackbarProps) => {
  const { message, type, theme } = props;
  return (
    <SnackBarContainer
      color={type === 'error' ? theme.errorRed : type === 'info' ? theme.lightAccent : theme.primaryButton}
    >
      <Image src={type === 'error' ? errorIcon : type === 'info' ? infoIcon : successIcon} />
      <Text
        theme={theme}
        style={{
          margin: 0,
          fontWeight: 500,
          fontSize: '1.25rem',
          color: type === 'error' ? theme.white : theme.darkAccent,
          wordWrap: 'break-word',
        }}
      >
        {message}
      </Text>
    </SnackBarContainer>
  );
};
