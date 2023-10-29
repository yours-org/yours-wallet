import { styled } from 'styled-components';
import { ColorThemeProps, Theme } from '../theme';
import coins from '../assets/coins.svg';
import apps from '../assets/items.svg';
import tokens from '../assets/tokens.svg';
import settings from '../assets/settings.svg';
import { MenuItems } from '../contexts/BottomMenuContext';
import { Badge } from './Reusable';
import { NetWork } from '../utils/network';

const Container = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  width: 100%;
  height: 3.75rem;
  position: absolute;
  bottom: 0;
  background: ${({ theme }) => theme.darkAccent};
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
  margin: 1rem;
  opacity: ${(props) => props.opacity};
  cursor: pointer;
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
  onClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  opacity: number;
  theme: Theme;
};

const Menu = (props: MenuProps) => {
  return (
    <MenuContainer>
      {props.badge ? (
        <>
          <Icon src={props.src} onClick={props.onClick} opacity={props.opacity} />
          <Badge style={{ position: 'absolute', marginTop: '-0.5rem' }}>{props.badge}</Badge>
        </>
      ) : (
        <Icon src={props.src} onClick={props.onClick} opacity={props.opacity} />
      )}
    </MenuContainer>
  );
};

export const BottomMenu = (props: BottomMenuProps) => {
  const { selected, handleSelect, theme } = props;

  return (
    <Container theme={theme}>
      <Menu theme={theme} src={coins} onClick={() => handleSelect('bsv')} opacity={selected === 'bsv' ? 1 : 0.4} />
      <Menu theme={theme} src={tokens} onClick={() => handleSelect('ords')} opacity={selected === 'ords' ? 1 : 0.4} />
      <Menu theme={theme} src={apps} onClick={() => handleSelect('apps')} opacity={selected === 'apps' ? 1 : 0.4} />
      <Menu
        theme={theme}
        src={settings}
        onClick={() => handleSelect('settings')}
        opacity={selected === 'settings' ? 1 : 0.4}
        badge={props.network === NetWork.Testnet ? 'testnet' : undefined}
      />
    </Container>
  );
};
