import styled from "styled-components";
import { ColorThemeProps, Theme } from "../theme";
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

const TitleText = styled.h1<ColorThemeProps>`
  font-size: 2rem;
  color: ${({ theme }) => theme.white};
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 600;
  margin: 0.25rem 0;
  text-align: center;
`;

export type SettingsProps = {
  theme: Theme;
};
export const Settings = (props: SettingsProps) => {
  const { theme } = props;
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
            theme={theme}
            message="Make sure you have your seed phrase backed up!"
            onCancel={handleCancel}
            onConfirm={handleSignOut}
            showSpeedBump={showSpeedBump}
          />
        }
      >
        <TitleText theme={theme}>⚙️</TitleText>
        <TitleText theme={theme}>My Settings</TitleText>
        <Text theme={theme}>Page is under active development.</Text>
        <Button
          theme={theme}
          label="Sign Out"
          type="warn"
          onClick={() => setShowSpeedBump(true)}
        />
      </Show>
    </Content>
  );
};
