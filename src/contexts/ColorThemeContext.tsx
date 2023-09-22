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
  userTheme?: Theme;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  userTheme,
}) => {
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
