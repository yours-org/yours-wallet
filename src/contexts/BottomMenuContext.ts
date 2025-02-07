import { createContext } from 'react';

export type MenuItems = 'bsv' | 'ords' | 'tools' | 'settings';

type BottomMenuContextType = {
  selected: MenuItems | null;
  query: string;
  handleSelect: (item: MenuItems, query?: string) => void;
  showMenu: () => void;
  hideMenu: () => void;
  isVisible: boolean;
};

export const BottomMenuContext = createContext<BottomMenuContextType | null>(null);
