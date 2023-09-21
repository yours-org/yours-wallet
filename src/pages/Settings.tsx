import styled from "styled-components";
import { colors } from "../colors";
import { useBottomMenu } from "../hooks/useBottomMenu";
import { Text } from "../components/Reusable";
import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { SpeedBump } from "../components/SpeedBump";
import { storage } from "../utils/storage";
import { Show } from "../components/Show";

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  position: relative;
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
  const { setSelected } = useBottomMenu();
  const [showSpeedBump, setShowSpeedBump] = useState(false);

  const handleSignOut = async () => {
    await storage.clear();
    window.location.reload();
  };

  const handleCancel = () => {
    setShowSpeedBump(false);
  };

  useEffect(() => {
    setSelected("settings");
  }, [setSelected]);

  return (
    <Content>
      <Show
        when={!showSpeedBump}
        whenFalseContent={
          <SpeedBump
            message="Make sure you have your seed phrase backed up!"
            onCancel={handleCancel}
            onConfirm={handleSignOut}
            showSpeedBump={showSpeedBump}
          />
        }
      >
        <TitleText>⚙️</TitleText>
        <TitleText>My Settings</TitleText>
        <Text>Page is under active development.</Text>
        <Button
          label="Sign Out"
          type="warn"
          onClick={() => setShowSpeedBump(true)}
        />
      </Show>
    </Content>
  );
};
