import { useTheme } from '../hooks/useTheme';

export type WalletRowTypes = {
  element: JSX.Element;
  onClick: () => void;
};

export const WalletRow = (props: WalletRowTypes) => {
  const { element, onClick } = props;
  const { theme } = useTheme();
  return (
    <div
      onClick={onClick}
      className="flex items-center rounded-xl px-4 py-3 mx-3 cursor-pointer transition-colors duration-150 bg-[#17191E] hover:bg-[#1f2128]"
      style={{ border: `1px solid ${theme.color.global.gray}15` }}
    >
      {element}
    </div>
  );
};
