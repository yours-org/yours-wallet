import { ReactNode, createContext, useState } from 'react';
import { NetWork } from 'yours-wallet-provider';
import { BottomMenu } from '../components/BottomMenu';
import { useTheme } from '../hooks/useTheme';

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

interface BottomMenuProviderProps {
  network: NetWork;
  children: ReactNode;
}

export const BottomMenuProvider = (props: BottomMenuProviderProps) => {
  const { children, network } = props;
  const { theme } = useTheme();
  const [selected, setSelected] = useState<MenuItems | null>(null);
  const [query, setQuery] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  const handleSelect = (item: MenuItems, pageQuery?: string) => {
    setSelected(item);
    if (pageQuery) setQuery(pageQuery);
  };

  const showMenu = () => {
    setIsVisible(true);
  };

  const hideMenu = () => {
    setIsVisible(false);
  };

  return (
    <BottomMenuContext.Provider
      value={{
        selected,
        handleSelect,
        isVisible,
        showMenu,
        hideMenu,
        query,
      }}
    >
      {isVisible && <BottomMenu theme={theme} network={network} handleSelect={handleSelect} selected={selected} />}
      {children}
    </BottomMenuContext.Provider>
  );
};
