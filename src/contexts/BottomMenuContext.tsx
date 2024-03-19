import { ReactNode, createContext, useState } from 'react';
import { BottomMenu } from '../components/BottomMenu';
import { useTheme } from '../hooks/useTheme';
import { useWeb3Context } from '../hooks/useWeb3Context';

export type MenuItems = 'bsv' | 'ords' | 'apps' | 'settings';

type BottomMenuContextType = {
  selected: MenuItems | null;
  setSelected: React.Dispatch<React.SetStateAction<MenuItems | null>>;
  query: string;
  handleSelect: (item: MenuItems, query?: string) => void;
  showMenu: () => void;
  hideMenu: () => void;
  isVisible: boolean;
};

export const BottomMenuContext = createContext<BottomMenuContextType | null>(null);

interface BottomMenuProviderProps {
  children: ReactNode;
}

export const BottomMenuProvider = (props: BottomMenuProviderProps) => {
  const { children } = props;
  const { theme } = useTheme();
  const [selected, setSelected] = useState<MenuItems | null>(null);
  const [query, setQuery] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const { network } = useWeb3Context();

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
        setSelected,
        query,
      }}
    >
      {isVisible && <BottomMenu theme={theme} network={network} handleSelect={handleSelect} selected={selected} />}
      {children}
    </BottomMenuContext.Provider>
  );
};
