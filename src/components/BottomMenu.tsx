import { styled } from 'styled-components';
import { ColorThemeProps, Theme } from '../theme';
import { MenuItems } from '../contexts/BottomMenuContext';
import { Badge, Text } from './Reusable';
import { Show } from './Show';
import { NetWork } from 'yours-wallet-provider';
import {
  FaAppStore,
  FaBitcoin,
  FaCoffee,
  FaCog,
  FaCoins,
  FaHandsHelping,
  FaHome,
  FaList,
  FaResearchgate,
  FaSmileBeam,
} from 'react-icons/fa';
import { ComponentType, ReactElement } from 'react';

const Container = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  width: 100%;
  height: 3.75rem;
  position: absolute;
  bottom: 0;
  background: ${({ theme }) => theme.mainBackground};
  color: ${({ theme }) => theme.white + '80'};
  z-index: 100;
`;

const MenuContainer = styled.div<ColorThemeProps>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 3.75rem;
  bottom: 0;
  z-index: 100;
  position: relative;
`;

const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
`;

const StyledText = styled(Text)<{ $opacity: number }>`
  color: ${({ theme }) => theme.white};
  opacity: ${(props) => props.$opacity};
`;

export type BottomMenuProps = {
  selected: MenuItems | null;
  handleSelect: (item: MenuItems) => void;
  theme: Theme;
  network: NetWork;
};

export type MenuProps = {
  badge?: string;
  icon: ComponentType<{ size?: string; opacity?: number; color?: string }>;
  iconSize?: string;
  label: string;
  onClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  opacity: number;
  theme: Theme;
};

const Menu = (props: MenuProps) => {
  const { theme, label, onClick, opacity, icon: IconComponent, iconSize = '1rem', badge } = props;

  return (
    <MenuContainer>
      <ContentWrapper>
        <div onClick={onClick} style={{ opacity, cursor: 'pointer' }}>
          <IconComponent opacity={opacity} size={iconSize} color={theme.white} />
        </div>
        <StyledText style={{ margin: 0, fontSize: '0.65rem' }} theme={theme} $opacity={opacity}>
          {label}
        </StyledText>
        <Show when={!!badge}>
          <Badge style={{ position: 'absolute' }}>{badge}</Badge>
        </Show>
      </ContentWrapper>
    </MenuContainer>
  );
};

export default Menu;

export const BottomMenu = (props: BottomMenuProps) => {
  const { selected, handleSelect, theme } = props;

  return (
    <Container theme={theme}>
      <Menu
        label="BSV"
        theme={theme}
        icon={FaCoins}
        onClick={() => handleSelect('bsv')}
        opacity={selected === 'bsv' ? 1 : 0.6}
      />
      <Menu
        label="Ordinals"
        theme={theme}
        icon={FaList}
        onClick={() => handleSelect('ords')}
        opacity={selected === 'ords' ? 1 : 0.6}
      />
      <Menu
        label="Resources"
        theme={theme}
        icon={FaSmileBeam}
        onClick={() => handleSelect('apps')}
        opacity={selected === 'apps' ? 1 : 0.6}
      />
      <Menu
        label="Settings"
        theme={theme}
        icon={FaCog}
        onClick={() => handleSelect('settings')}
        opacity={selected === 'settings' ? 1 : 0.6}
        badge={props.network === 'testnet' ? 'testnet' : undefined}
      />
    </Container>
  );
};
