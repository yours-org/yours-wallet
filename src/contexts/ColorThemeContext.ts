import { createContext } from 'react';
import { Theme } from '../theme.types';

export interface ThemeContextProps {
  theme: Theme;
}

export const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);
