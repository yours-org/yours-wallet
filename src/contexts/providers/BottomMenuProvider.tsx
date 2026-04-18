import { ReactNode, useState } from 'react';
import { BottomMenu } from '../../components/BottomMenu';
import { useTheme } from '../../hooks/useTheme';
import { BottomMenuContext, MenuItems } from '../BottomMenuContext';

interface BottomMenuProviderProps {
  children: ReactNode;
}

export const BottomMenuProvider = (props: BottomMenuProviderProps) => {
  const { children } = props;
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

  const clearSelection = () => {
    setSelected(null);
  };

  return (
    <BottomMenuContext.Provider
      value={{
        selected,
        handleSelect,
        clearSelection,
        isVisible,
        showMenu,
        hideMenu,
        query,
      }}
    >
      {isVisible && <BottomMenu theme={theme} handleSelect={handleSelect} selected={selected} />}
      {children}
    </BottomMenuContext.Provider>
  );
};
