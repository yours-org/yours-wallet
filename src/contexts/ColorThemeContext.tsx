// ThemeContext.tsx
import React, { createContext, useEffect, useState } from "react";
import { Theme, defaultTheme } from "../theme";

export interface ThemeContextProps {
  theme: Theme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
}

export const ThemeContext = createContext<ThemeContextProps | undefined>(
  undefined
);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = (
  props: ThemeProviderProps
) => {
  const { children } = props;
  const userTheme: Theme = false || defaultTheme; // TODO: In place of false, we need to call or look for a specific inscription pattern and set the user theme (just do in useEffect?)
  const [theme, setTheme] = useState<Theme>(userTheme || defaultTheme);

  useEffect(() => {
    if (userTheme) setTheme(userTheme);
  }, [userTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
