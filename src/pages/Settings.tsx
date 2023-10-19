import styled from "styled-components";
import { useBottomMenu } from "../hooks/useBottomMenu";
import { useEffect, useState } from "react";
import { SpeedBump } from "../components/SpeedBump";
import { storage } from "../utils/storage";
import { Show } from "../components/Show";
import { useTheme } from "../hooks/useTheme";
import { useWalletLockState } from "../hooks/useWalletLockState";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { useSnackbar } from "../hooks/useSnackbar";
import { SNACKBAR_TIMEOUT } from "../utils/constants";
import { useWeb3Context } from "../hooks/useWeb3Context";
import { NetWork } from "../utils/network";
import { SettingsRow } from "../components/SettingsRow";
import { HeaderText, Text } from "../components/Reusable";
import { ForwardButton } from "../components/ForwardButton";
import { ColorThemeProps } from "../theme";
import { BackButton } from "../components/BackButton";
import x from "../assets/x.svg";

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const HeaderWrapper = styled.div`
  position: absolute;
  top: 1rem;
`;

const ConnectedAppRow = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.darkAccent};
  border-radius: 0.5rem;
  padding: 1rem;
  margin: 0.25rem;
  width: 80%;
`;

const ConnectedAppText = styled(Text)<ColorThemeProps>`
  color: ${({ theme }) => theme.white};
  margin: 0;
  text-align: left;
`;

export const XIcon = styled.img`
  width: 1.25rem;
  height: 1.25rem;
  top: 1.5rem;
  left: 1.5rem;
  cursor: pointer;
`;

type SettingsPage = "main" | "connected-apps";

export const Settings = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const { lockWallet } = useWalletLockState();
  const [showSpeedBump, setShowSpeedBump] = useState(false);
  const { addSnackbar } = useSnackbar();
  const { network, updateNetwork } = useWeb3Context();
  const [page, setPage] = useState<SettingsPage>("main");
  const [connectedApps, setConnectedApps] = useState<string[]>([]);

  useEffect(() => {
    const getWhitelist = (): Promise<string[]> => {
      return new Promise((resolve, reject) => {
        storage.get(["whitelist"], async (result) => {
          try {
            const { whitelist } = result;
            setConnectedApps(whitelist ?? []);
            resolve(whitelist ?? []);
          } catch (error) {
            reject(error);
          }
        });
      });
    };

    getWhitelist();
  }, []);

  const handleRemoveDomain = (domain: string) => {
    const newList = connectedApps.filter((app) => app !== domain);
    storage.set({ whitelist: newList });
    setConnectedApps(newList);
  };

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

  const handleNetworkChange = (e: any) => {
    const network = e.target.checked ? NetWork.Testnet : NetWork.Mainnet;
    updateNetwork(network);

    // The provider relies on appState in local storage to accurately return addresses. This is an easy way to handle making sure the state is always up to date.
    addSnackbar(`Switching to ${network}`, "info");
    setTimeout(() => {
      window.location.reload();
    }, SNACKBAR_TIMEOUT - 500);
  };

  const main = (
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
      <SettingsRow
        name="Connected Apps"
        description="Manage the apps you are connected to"
        onClick={() => setPage("connected-apps")}
        jsxElement={<ForwardButton />}
      />
      <SettingsRow
        name="Testnet Mode"
        description="Applies to balances and app connections"
        jsxElement={
          <ToggleSwitch
            theme={theme}
            on={network === NetWork.Testnet}
            onChange={handleNetworkChange}
          />
        }
      />
      <SettingsRow
        name="Lock Wallet"
        description="Immediately lock the wallet"
        onClick={lockWallet}
      />
      <SettingsRow
        name="Sign Out"
        description="Sign out of Panda Wallet completely"
        onClick={() => setShowSpeedBump(true)}
      />
    </Show>
  );

  const connectedAppsPage = (
    <>
      <BackButton onClick={() => setPage("main")} />
      <Show
        when={connectedApps.length > 0}
        whenFalseContent={
          <ConnectedAppText theme={theme}>No apps connected</ConnectedAppText>
        }
      >
        {connectedApps.map((app) => {
          return (
            <ConnectedAppRow theme={theme}>
              <ConnectedAppText theme={theme}>{app}</ConnectedAppText>
              <XIcon src={x} onClick={() => handleRemoveDomain(app)} />
            </ConnectedAppRow>
          );
        })}
      </Show>
    </>
  );

  return (
    <Content>
      <HeaderWrapper>
        <HeaderText style={{ fontSize: "1.25rem" }} theme={theme}>
          {page === "connected-apps" ? "Connected Apps" : "Settings"}
        </HeaderText>
      </HeaderWrapper>
      <Show when={page === "main"}>{main}</Show>
      <Show when={page === "connected-apps"}>{connectedAppsPage}</Show>
    </Content>
  );
};
