export interface Theme {
  darkAccent: string;
  mainBackground: string;
  lightAccent: string;
  primaryButton: string;
  white: string;
  black: string;
  errorRed: string;
}

export type ColorThemeProps = {
  theme: Theme;
};

export const defaultTheme: Theme = {
  darkAccent: '#164B60',
  mainBackground: '#1B6B93',
  lightAccent: '#4FC0D0',
  primaryButton: '#A2FF86',
  white: '#FFFFFF',
  black: '#000000',
  errorRed: '#FF4646',
};
