import { styled } from 'styled-components';
import { ColorThemeProps, Theme } from '../theme';
import home from '../assets/home.svg';
import info from '../assets/info.svg';
import tokens from '../assets/grid.svg';
import settings from '../assets/settings.svg';
import { MenuItems } from '../contexts/BottomMenuContext';
import { Badge, Text } from './Reusable';
import { NetWork } from '../utils/network';
import { Show } from './Show';

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
  width: 100%;
  height: 3.75rem;
  bottom: 0;
  z-index: 100;
  position: relative;
`;

const Icon = styled.img<{ opacity: number }>`
  width: 1.5rem;
  height: 1.5rem;
  opacity: ${(props) => props.opacity};
  cursor: pointer;
`;

const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
`;

export type BottomMenuProps = {
  selected: MenuItems | null;
  handleSelect: (item: MenuItems) => void;
  theme: Theme;
  network: NetWork;
};

export type MenuProps = {
  badge?: string;
  src: string;
  label: string;
  onClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  opacity: number;
  theme: Theme;
};

const Menu = (props: MenuProps) => {
  const { theme, label, onClick, opacity, src, badge } = props;
  return (
    <MenuContainer>
      <ContentWrapper>
        <Icon src={src} onClick={onClick} opacity={opacity} />
        <Text style={{ fontSize: '0.65rem', opacity: opacity }} theme={theme}>
          {label}
        </Text>
        <Show when={!!badge}>
          <Badge style={{ position: 'absolute', marginTop: '-0.5rem' }}>{badge}</Badge>
        </Show>
      </ContentWrapper>
    </MenuContainer>
  );
};

export const BottomMenu = (props: BottomMenuProps) => {
  const { selected, handleSelect, theme } = props;

  return (
    <Container theme={theme}>
      <Menu
        label="Home"
        theme={theme}
        src={home}
        onClick={() => handleSelect('bsv')}
        opacity={selected === 'bsv' ? 1 : 0.4}
      />
      <Menu
        label="Tokens"
        theme={theme}
        src={tokens}
        onClick={() => handleSelect('ords')}
        opacity={selected === 'ords' ? 1 : 0.4}
      />
      <Menu
        label="Resources"
        theme={theme}
        src={info}
        onClick={() => handleSelect('apps')}
        opacity={selected === 'apps' ? 1 : 0.4}
      />
      <Menu
        label="Settings"
        theme={theme}
        src={settings}
        onClick={() => handleSelect('settings')}
        opacity={selected === 'settings' ? 1 : 0.4}
        badge={props.network === NetWork.Testnet ? 'testnet' : undefined}
      />
    </Container>
  );
};
