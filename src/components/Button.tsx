import styled from 'styled-components';
import { WhiteLabelTheme, Theme } from '../theme.types';
import { Show } from './Show';

export type ButtonStyles = 'primary' | 'secondary' | 'secondary-outline' | 'warn';

const Container = styled.div`
  display: flex;
  justify-content: center;
  width: 100%;
`;

const Primary = styled.button<WhiteLabelTheme>`
  width: 87%;
  height: 2.25rem;
  background: linear-gradient(
    45deg,
    ${({ theme }) => theme.color.component.primaryButtonLeftGradient},
    ${({ theme }) => theme.color.component.primaryButtonRightGradient}
  );
  color: ${({ theme }) => theme.color.component.primaryButtonText};
  border: none;
  border-radius: 0.25rem;
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  margin: 0.5rem;
  cursor: pointer;
  transition: 0.3s ease-in-out;
  transform: scale(1);

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    background: ${({ theme }) => theme.color.component.primaryButtonRightGradient + '40'};
  }

  &:hover {
    transform: scale(1.02);
  }
`;

const GradientBorderWrapper = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  padding: 1px; /* border thickness */
  background: linear-gradient(
    45deg,
    ${({ theme }) => theme.color.component.secondaryOutlineButtonGradientLeft},
    ${({ theme }) => theme.color.component.secondaryOutlineButtonGradientRight}
  );
  border-radius: 0.25rem;
  width: 87%;
  margin: 0.25rem;
`;

const SecondaryOutline = styled(Primary)<{ $isOutline?: boolean }>`
  width: 100%;
  height: 2.25rem;
  background: ${({ theme }) => theme.color.global.walletBackground};
  border: none;
  color: ${(props) => (props.$isOutline ? props.theme.color.global.contrast : props.theme.color.global.gray)};
  transition: none;
  transform: none;
  margin: 0;

  &:disabled {
    opacity: 1;
    background: ${({ theme }) => theme.color.global.walletBackground};
  }

  &:hover {
    transform: none;
  }
`;

const Secondary = styled(SecondaryOutline)`
  margin: 0.5rem 0 0 0;
`;

const Warn = styled(Primary)<WhiteLabelTheme>`
  background: ${({ theme }) => theme.color.component.warningButton};
  color: ${({ theme }) => theme.color.component.warningButtonText};

  &:disabled {
    background: ${({ theme }) => theme.color.component.warningButton + '40'};
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
    <Container>
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
          <SecondaryOutline
            theme={theme}
            disabled={disabled}
            onClick={onClick}
            type={isSubmit ? 'submit' : 'button'}
            style={style}
            $isOutline
          >
            {label}
          </SecondaryOutline>
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
    </Container>
  );
};
