import styled, { keyframes } from 'styled-components';
import { Text } from './Reusable';
import { SnackbarType } from '../contexts/SnackbarContext';
import { ColorThemeProps, Theme } from '../theme.types';
import { FaCheckCircle, FaExclamation, FaInfoCircle } from 'react-icons/fa';
import { Show } from './Show';

type SnackBarColorTheme = ColorThemeProps & { color: string };

const slideIn = keyframes`
  from {
    bottom: -15px;
    opacity: 0;
  }
  to {
    bottom: 0;
    opacity: 1;
  }
`;

// Animation for fading out
const fadeOut = keyframes`
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
`;

export const SnackBarContainer = styled.div<SnackBarColorTheme & { duration: number }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 90%;
  position: absolute;
  bottom: 0;
  margin: 1rem;
  border-radius: 0.5rem;
  background-color: ${({ color }) => color};
  color: ${({ theme }) => theme.white};
  z-index: 200;
  animation:
    ${slideIn} 0.25s ease-out,
    ${fadeOut} 0.25s ease-out ${({ duration }) => `${duration}s`};
  animation-fill-mode: forwards;
`;

export type SnackbarProps = {
  /** The message that should be displayed on the snackbar */
  message: string;
  /** The type of snackbar. success | error | info */
  type: SnackbarType | null;
  theme: Theme;
  duration?: number;
};

export const Snackbar = (props: SnackbarProps) => {
  const { message, type, theme, duration = 2.5 } = props;
  return (
    <SnackBarContainer
      duration={duration}
      color={type === 'error' ? theme.errorRed : type === 'info' ? theme.warning : theme.lightAccent}
    >
      <Show when={type === 'error'}>
        <FaExclamation color={theme.black} size={'1.25rem'} style={{ margin: '0.5rem' }} />
      </Show>
      <Show when={type === 'info'}>
        <FaInfoCircle color={theme.black} size={'1.25rem'} style={{ margin: '0.5rem' }} />
      </Show>
      <Show when={type === 'success'}>
        <FaCheckCircle color={theme.black} size={'1.25rem'} style={{ margin: '0.5rem' }} />
      </Show>
      <Text
        theme={theme}
        style={{
          margin: '1rem 0 1rem .25rem',
          color: theme.black,
          wordWrap: 'break-word',
          textAlign: 'left',
        }}
      >
        {message}
      </Text>
    </SnackBarContainer>
  );
};
