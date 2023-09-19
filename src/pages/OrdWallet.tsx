import styled from "styled-components";
import { colors } from "../colors";
import { BottomMenu } from "../components/BottomMenu";
import { useBottomMenu } from "../hooks/useBottomMenu";
import { useEffect } from "react";
import { Text } from "../components/Reusable";

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const TitleText = styled.h1`
  font-size: 2rem;
  color: ${colors.white};
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 600;
  margin: 0.25rem 0;
  text-align: center;
`;

export const OrdWallet = () => {
  const { handleSelect, selected, setSelected } = useBottomMenu();

  useEffect(() => {
    setSelected("ords");
  }, [setSelected]);

  return (
    <Content>
      <TitleText>🛠</TitleText>
      <TitleText>My Ordinals</TitleText>
      <Text>Feature under development</Text>
      <BottomMenu handleSelect={handleSelect} selected={selected} />
    </Content>
  );
};
