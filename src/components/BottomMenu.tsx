import { styled } from "styled-components";
import { ColorThemeProps, Theme } from "../theme";
import coins from "../assets/coins.svg";
import nfts from "../assets/items.svg";
import settings from "../assets/settings.svg";
import { MenuItems } from "../contexts/BottomMenuContext";

const Container = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  width: 100%;
  height: 3.75rem;
  position: absolute;
  bottom: 0;
  background: ${({ theme }) => theme.darkAccent};
  color: ${({ theme }) => theme.white + "80"};
  z-index: 100;
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
};

export const BottomMenu = (props: BottomMenuProps) => {
  const { selected, handleSelect, theme } = props;

  return (
    <Container theme={theme}>
      <Icon
        src={coins}
        onClick={() => handleSelect("bsv")}
        opacity={selected === "bsv" ? 1 : 0.4}
      />
      <Icon
        src={nfts}
        onClick={() => handleSelect("ords")}
        opacity={selected === "ords" ? 1 : 0.4}
      />
      <Icon
        src={settings}
        onClick={() => handleSelect("settings")}
        opacity={selected === "settings" ? 1 : 0.4}
        style={{ width: "1.75rem", height: "1.75rem" }}
      />
    </Container>
  );
};
