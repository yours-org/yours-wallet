// ThemeContext.tsx
import React, { ReactNode, createContext, useEffect, useState } from 'react';
import { useServiceContext } from '../hooks/useServiceContext';
import { Theme, defaultTheme } from '../theme';
import { whiteListedColorThemeCollections } from '../utils/constants';

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
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const { chromeStorageService, ordinalService } = useServiceContext();
  const ordinals = ordinalService.ordinals;

  useEffect(() => {
    const { colorTheme } = chromeStorageService.getCurrentAccountObject();
    if (colorTheme) {
      setTheme(colorTheme);
    }

    if (!ordinals.initialized) return;

    const themeOrds = ordinals.data.filter((ord) =>
      whiteListedColorThemeCollections.includes(ord.origin?.data?.map?.subTypeData?.collectionId),
    );

    if (themeOrds.length > 0) {
      const themeOrd = themeOrds[0]; // User that holds multiple themes in wallet is not yet supported so will always use index 0
      const colorTheme = JSON.parse(themeOrd.origin?.data?.map?.colorTheme) as Theme;

      setTheme(colorTheme);
      chromeStorageService.update({ colorTheme });
    } else {
      chromeStorageService.remove('colorTheme');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};
