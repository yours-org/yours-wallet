import React, { ReactNode, createContext } from 'react';
import { Theme } from '../theme.types';
import walletTheme from '../theme.json';

export interface ThemeContextProps {
  theme: Theme;
}

export const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const theme = walletTheme as Theme;
  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
};
