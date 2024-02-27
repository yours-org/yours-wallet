export interface Theme {
  darkAccent: string;
  mainBackground: string;
  lightAccent: string;
  primaryButton: string;
  white: string;
  black: string;
  gray: string;
  errorRed: string;
}

export type ColorThemeProps = {
  theme: Theme;
};

export const defaultTheme: Theme = {
  darkAccent: '#17191E',
  mainBackground: '#010101',
  lightAccent: '#A1FF8B',
  primaryButton: '#34D399',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#98A2B3',
  errorRed: '#FF4646',
};
