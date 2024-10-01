import styled, { css } from 'styled-components';
import { WhiteLabelTheme } from '../theme.types';

export const HeaderText = styled.h1<WhiteLabelTheme>`
  font-size: 1.35rem;
  color: ${({ theme }) =>
    theme.color.global.primaryTheme === 'dark' ? theme.color.global.contrast : theme.color.global.neutral};
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  font-weight: 600;
  margin: 0.25rem 0;
  text-align: center;
`;

export const SubHeaderText = styled.h1<WhiteLabelTheme>`
  font-size: 1rem;
  color: ${({ theme }) =>
    theme.color.global.primaryTheme === 'dark' ? theme.color.global.contrast : theme.color.global.neutral};
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  font-weight: 400;
  margin: 0.1rem 0;
  text-align: center;
`;

export const Divider = styled.hr`
  width: 80%;
  opacity: 0.3;
  margin: 1rem;
`;

export const Text = styled.p<WhiteLabelTheme>`
  font-size: 0.85rem;
  color: ${({ theme }) =>
    theme.color.global.primaryTheme === 'dark' ? theme.color.global.contrast : theme.color.global.neutral};
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  font-weight: 400;
  margin: 0.25rem 0 1rem 0;
  text-align: center;
  width: 90%;
`;

export const Badge = styled.button<{ $primary?: boolean }>`
  background: transparent;
  border-radius: 0.5rem;
  border: none;
  color: ${({ theme }) =>
    theme.color.global.primaryTheme === 'dark'
      ? theme.color.global.contrast + '90'
      : theme.color.global.neutral + '90'};
  margin: 0.5em 1em;
  padding: 0.25em 1em;
  ${() => css`
    background: #bf4f74;
    color: white;
  `}
`;

export const ConfirmContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

export const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
`;

export const ButtonContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 90%;
  margin: 0.5rem;
`;

export const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: calc(100% - 3.75rem);
  overflow-y: auto;
`;

export const ReceiveContent = styled(MainContent)`
  justify-content: center;
  width: 100%;
  height: calc(100% - 3.75rem);
`;

export const StyledImage = styled.img<{ $size?: string }>`
  width: ${({ $size }) => $size ?? '5rem'};
  height: ${({ $size }) => $size ?? '5rem'};
`;

export const GithubIcon = styled.img`
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
`;

export const Warning = styled.span<WhiteLabelTheme>`
  color: ${({ theme }) => theme.color.component.snackbarWarning};
  font-weight: 700;
`;
