import styled from "styled-components";
import { Theme } from "../theme";
import { HeaderText, Text } from "./Reusable";
import { useState } from "react";

const Container = styled.div<{ color: string; $clickable: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${(props) => props.color};
  width: 80%;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin: 0.25rem;
  cursor: ${(props) => (props.$clickable === "true" ? "pointer" : "default")};
`;



const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

const Tick = styled(HeaderText)`
  font-size: 1rem;
  text-align: left;
  width: 100%;
  overflow: hidden;
  max-width: 10rem;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const Description = styled(Text)`
  font-size: 0.75rem;
  text-align: left;
  width: 100%;
  margin: 0;
`;


export type BSV20ItemProps = {
  theme: Theme;
  tick: string;
  amount: string;
  selected?: boolean;
  onClick?: () => void;
};


export const BSV20Item = (props: BSV20ItemProps) => {
  const { tick, amount, theme, onClick } = props;

  const [containerColor, setContainerColor] = useState(theme.darkAccent);

  return (<Container
      color={containerColor}
      onMouseEnter={() =>
        onClick ? setContainerColor(theme.darkAccent + "99") : undefined
      }
      onMouseLeave={() => setContainerColor(theme.darkAccent)}
      onClick={onClick}
      $clickable={onClick ? "true" : "false"}
    >
      <Content>
        <Tick theme={theme}>{tick}</Tick>
        <Description theme={theme}>{amount}</Description>
      </Content>
    </Container>)
};
