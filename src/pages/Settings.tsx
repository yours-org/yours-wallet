import styled from "styled-components";
import { ColorThemeProps } from "../theme";
import { useBottomMenu } from "../hooks/useBottomMenu";
import { Text } from "../components/Reusable";
import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { SpeedBump } from "../components/SpeedBump";
import { storage } from "../utils/storage";
import { Show } from "../components/Show";
import { useTheme } from "../hooks/useTheme";
import { useWalletLockState } from "../hooks/useWalletLockState";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { NetWork, useNetwork } from "../hooks/useNetwork";

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

export const Settings = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const { lockWallet } = useWalletLockState();
  const [showSpeedBump, setShowSpeedBump] = useState(false);
  const { network, updateNetwork } = useNetwork();

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

  const handleLock = () => {
    lockWallet();
    setSelected("bsv");
  };

  const handleNetworkChange = (e: any) => {
    updateNetwork(e.target.checked ? NetWork.Mainnet : NetWork.Testnet)
  };

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

        <ToggleSwitch
          theme={theme}
          on={network === NetWork.Mainnet}
          onChange={handleNetworkChange}
          label="Network"
          onLabel="Mainnet"
          offLabel="Testnet"
        />
        <Button
          theme={theme}
          label="Sign Out"
          type="warn"
          onClick={() => setShowSpeedBump(true)}
        />
        <Button
          theme={theme}
          label="Lock Wallet"
          type="secondary"
          onClick={handleLock}
        />
      </Show>
    </Content>
  );
};
