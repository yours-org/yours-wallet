import styled from 'styled-components';
import { ColorThemeProps, Theme } from '../theme';
import { Show } from './Show';

export type ButtonStyles = 'primary' | 'secondary' | 'secondary-outline' | 'warn';

const Primary = styled.button<ColorThemeProps>`
  width: 80%;
  height: 2.5rem;
  background: linear-gradient(45deg, ${({ theme }) => theme.lightAccent}, ${({ theme }) => theme.primaryButton});
  color: ${({ theme }) => theme.mainBackground};
  border: none;
  border-radius: 1.25rem;
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  font-size: 1rem;
  font-weight: 600;
  margin: 0.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  transform: scale(1);

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    background-color: ${({ theme }) => theme.primaryButton + '40'};
  }

  &:hover {
    transform: scale(1.025);
  }
`;

const GradientBorderWrapper = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  padding: 1px; /* This will be the border thickness */
  background: linear-gradient(45deg, ${({ theme }) => theme.lightAccent}, ${({ theme }) => theme.primaryButton});
  border-radius: 1.25rem; /* Adjust based on your button's border-radius */
  width: 80%; /* Adjust to fit inside the wrapper */
  margin: 0.5rem;
`;

const Secondary = styled(Primary)<{ $isOutline?: boolean }>`
  width: 100%; /* Adjust to fit inside the wrapper */
  height: 2.5rem;
  background: ${({ theme }) => theme.mainBackground};
  border: none;
  color: ${(props) => (props.$isOutline ? props.theme.white : props.theme.gray)};
  transition: none;
  transform: none;
  margin: 0;

  &:disabled {
    background: transparent;
    color: ${({ theme }) => theme.white + '40'};
  }

  &:hover {
    transform: none;
  }
`;

const Warn = styled(Primary)`
  background-color: ${({ theme }) => theme.errorRed + '95'};
  color: ${({ theme }) => theme.white};

  &:disabled {
    background-color: ${({ theme }) => theme.errorRed + '40'};
  }
`;

export type ButtonProps = {
  label: string;
  type: ButtonStyles;
  theme: Theme;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  isSubmit?: boolean;
  style?: React.CSSProperties;
};

export const Button = (props: ButtonProps) => {
  const { label, type, onClick, disabled, theme, isSubmit, style } = props;
  return (
    <>
      <Show when={type === 'primary'}>
        <Primary
          theme={theme}
          disabled={disabled}
          onClick={onClick}
          type={isSubmit ? 'submit' : 'button'}
          style={style}
        >
          {label}
        </Primary>
      </Show>
      <Show when={type === 'secondary-outline'}>
        <GradientBorderWrapper theme={theme}>
          <Secondary
            theme={theme}
            disabled={disabled}
            onClick={onClick}
            type={isSubmit ? 'submit' : 'button'}
            style={style}
            $isOutline
          >
            {label}
          </Secondary>
        </GradientBorderWrapper>
      </Show>
      <Show when={type === 'secondary'}>
        <Secondary
          theme={theme}
          disabled={disabled}
          onClick={onClick}
          type={isSubmit ? 'submit' : 'button'}
          style={style}
        >
          {label}
        </Secondary>
      </Show>
      <Show when={type === 'warn'}>
        <Warn theme={theme} disabled={disabled} onClick={onClick} type={isSubmit ? 'submit' : 'button'} style={style}>
          {label}
        </Warn>
      </Show>
    </>
  );
};
