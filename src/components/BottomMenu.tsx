import { Theme } from '../theme.types';
import { MenuItems } from '../contexts/BottomMenuContext';
import { Show } from './Show';
import { Wallet, Layers, Wrench, Settings, LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

export type BottomMenuProps = {
  selected: MenuItems | null;
  handleSelect: (item: MenuItems) => void;
  theme: Theme;
};

export type MenuProps = {
  badge?: string;
  icon: LucideIcon;
  label: string;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  isSelected: boolean;
  theme: Theme;
};

const Menu = (props: MenuProps) => {
  const { theme, label, onClick, isSelected, icon: IconComponent, badge } = props;

  const activeColor = theme.color.component.primaryButtonLeftGradient || '#A1FF8B';
  const inactiveColor = theme.color.component.bottomMenuText + '80';

  return (
    <div
      className="flex flex-col items-center justify-center flex-1 relative cursor-pointer py-2 select-none"
      onClick={onClick}
    >
      {/* Active indicator dot */}
      {isSelected && (
        <motion.div
          layoutId="tab-indicator"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${activeColor}, ${theme.color.component.primaryButtonRightGradient || '#34D399'})`,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}

      <motion.div
        animate={{
          scale: isSelected ? 1 : 0.95,
          opacity: isSelected ? 1 : 0.65,
        }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex flex-col items-center gap-1"
      >
        <IconComponent size={20} color={isSelected ? activeColor : inactiveColor} strokeWidth={isSelected ? 2 : 1.5} />
        <span
          className="text-[10px] font-medium tracking-wide"
          style={{ color: isSelected ? activeColor : inactiveColor }}
        >
          {label}
        </span>
      </motion.div>

      {/* Badge */}
      {badge && (
        <span
          className="absolute top-1 right-2 text-[8px] font-bold px-1 py-0.5 rounded-full leading-none"
          style={{ backgroundColor: '#bf4f74', color: '#fff' }}
        >
          {badge}
        </span>
      )}
    </div>
  );
};

export default Menu;

export const BottomMenu = (props: BottomMenuProps) => {
  const { selected, handleSelect, theme } = props;
  const active = selected ?? 'bsv';

  return (
    <div
      className="flex items-center w-full absolute bottom-0 z-[100]"
      style={{
        height: '3.75rem',
        backgroundColor: theme.color.component.bottomMenuBackground,
        borderTop: `1px solid ${theme.color.global.gray}18`,
      }}
    >
      <Menu
        label="Coins"
        theme={theme}
        icon={Wallet}
        onClick={() => handleSelect('bsv')}
        isSelected={active === 'bsv'}
      />
      <Show when={theme.settings.services.ordinals}>
        <Menu
          label="Ordinals"
          theme={theme}
          icon={Layers}
          onClick={() => handleSelect('ords')}
          isSelected={active === 'ords'}
        />
      </Show>
      <Menu
        label="Tools"
        theme={theme}
        icon={Wrench}
        onClick={() => handleSelect('tools')}
        isSelected={active === 'tools'}
      />
      <Menu
        label="Settings"
        theme={theme}
        icon={Settings}
        onClick={() => handleSelect('settings')}
        isSelected={active === 'settings'}
      />
    </div>
  );
};
