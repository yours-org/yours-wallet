import { ReactNode, createContext, useState } from "react";
import { BottomMenu } from "../components/BottomMenu";

export type MenuItems = "bsv" | "nfts" | "settings";

type BottomMenuContextType = {
  selected: MenuItems | null;
  setSelected: React.Dispatch<React.SetStateAction<MenuItems | null>>;
  handleSelect: (item: MenuItems) => void;
  showMenu: () => void;
  hideMenu: () => void;
  isVisible: boolean;
};

export const BottomMenuContext = createContext<BottomMenuContextType | null>(
  null
);

type BottomMenuProviderProps = {
  children: ReactNode;
};

export const BottomMenuProvider = (props: BottomMenuProviderProps) => {
  const { children } = props;
  const [selected, setSelected] = useState<MenuItems | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const handleSelect = (item: MenuItems) => {
    setSelected(item);
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
      }}
    >
      {isVisible && (
        <BottomMenu handleSelect={handleSelect} selected={selected} />
      )}
      {children}
    </BottomMenuContext.Provider>
  );
};
