import styled from "styled-components";
import { colors } from "../colors";
import { BottomMenu } from "../components/BottomMenu";
import { useBottomMenu } from "../hooks/useBottomMenu";
import { DescText } from "../components/Reusable";
import { useEffect } from "react";

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

export const Settings = () => {
  const { handleSelect, selected, setSelected } = useBottomMenu();

  useEffect(() => {
    setSelected("settings");
  }, [setSelected]);

  return (
    <Content>
      <TitleText>⚙️</TitleText>
      <TitleText>My Settings</TitleText>
      <DescText>Feature under development</DescText>
      <BottomMenu handleSelect={handleSelect} selected={selected} />
    </Content>
  );
};
