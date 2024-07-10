// ThemeContext.tsx
import React, { ReactNode, createContext, useEffect, useState } from 'react';
import { useOrds } from '../hooks/useOrds';
import { Theme, defaultTheme } from '../theme';
import { whiteListedColorThemeCollections } from '../utils/constants';
import { storage } from '../utils/storage';

export interface ThemeContextProps {
  theme: Theme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
}

export const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = (props: ThemeProviderProps) => {
  const { children } = props;
  const { ordinals } = useOrds();
  const [theme, setTheme] = useState<Theme>(defaultTheme);

  useEffect(() => {
    storage.get('colorTheme').then((result) => {
      if (result.colorTheme) {
        setTheme(result.colorTheme);
      }

      if (!ordinals.initialized) return;

      const themeOrds = ordinals.data.filter((ord) =>
        whiteListedColorThemeCollections.includes(ord.origin?.data?.map?.subTypeData?.collectionId),
      );

      if (themeOrds.length > 0) {
        const themeOrd = themeOrds[0]; // User that holds multiple themes in wallet is not yet supported so will always use index 0
        const colorTheme = JSON.parse(themeOrd.origin?.data?.map?.colorTheme) as Theme;

        setTheme(colorTheme);
        storage.set({ colorTheme });
      } else {
        storage.remove('colorTheme');
      }
    });
  }, [ordinals]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};
