import { styled } from 'styled-components';
import { WhiteLabelTheme, Theme } from '../theme.types';
import { MenuItems } from '../contexts/BottomMenuContext';
import { Badge, Text } from './Reusable';
import { Show } from './Show';
import { NetWork } from 'yours-wallet-provider';
import { FaCog, FaCoins, FaList, FaTools } from 'react-icons/fa';
import { ComponentType } from 'react';

const Container = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  width: 100%;
  height: 3.75rem;
  position: absolute;
  bottom: 0;
  background: ${({ theme }) => theme.color.component.bottomMenuBackground};
  color: ${({ theme }) => theme.color.component.bottomMenuText + '80'};
  z-index: 100;
`;

const MenuContainer = styled.div<WhiteLabelTheme>`
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
  color: ${({ theme }) => theme.color.component.bottomMenuText};
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
          <IconComponent opacity={opacity} size={iconSize} color={theme.color.component.bottomMenuText} />
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
  const services = theme.settings.services;

  return (
    <Container theme={theme}>
      <Menu
        label="BSV"
        theme={theme}
        icon={FaCoins}
        onClick={() => handleSelect('bsv')}
        opacity={selected === 'bsv' ? 1 : 0.6}
      />
      <Show when={theme.settings.services.ordinals || theme.settings.services.bsv20}>
        <Menu
          label={services.ordinals && services.bsv20 ? 'Ordinals' : services.ordinals ? 'NFTs' : 'Tokens'}
          theme={theme}
          icon={FaList}
          onClick={() => handleSelect('ords')}
          opacity={selected === 'ords' ? 1 : 0.6}
        />
      </Show>
      <Menu
        label="Tools"
        theme={theme}
        icon={FaTools}
        onClick={() => handleSelect('tools')}
        opacity={selected === 'tools' ? 1 : 0.6}
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
