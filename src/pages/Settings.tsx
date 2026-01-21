import { useEffect, useState } from "react";
import styled from "styled-components";
import x from "../assets/x.svg";
import { Button } from "../components/Button";
import { ForwardButton } from "../components/ForwardButton";
import { Input } from "../components/Input";
import { QrCode } from "../components/QrCode";
import { Text } from "../components/Reusable";
import { SettingsRow } from "../components/SettingsRow";
import { Show } from "../components/Show";
import { SpeedBump } from "../components/SpeedBump";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { TopNav } from "../components/TopNav";
import { useBottomMenu } from "../hooks/useBottomMenu";
import { useSocialProfile } from "../hooks/useSocialProfile";
import { useTheme } from "../hooks/useTheme";
import { useServiceContext } from "../hooks/useServiceContext";
import { WhitelistedApp, YoursEventName } from "../inject";
import { WhiteLabelTheme } from "../theme.types";
import { sendMessage } from "../utils/chromeHelpers";
import { FEE_PER_KB } from "../utils/constants";
import { ChromeStorageObject } from "../services/types/chromeStorage.types";
import { CreateAccount } from "./onboarding/CreateAccount";
import { RestoreAccount } from "./onboarding/RestoreAccount";
import { ImportAccount } from "./onboarding/ImportAccount";
import { AccountRow } from "../components/AccountRow";
import {
  MasterBackupProgressEvent,
  streamDataToZip,
} from "../utils/masterExporter";
import { useSnackbar } from "../hooks/useSnackbar";

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: calc(75%);
  overflow-y: auto;
  overflow-x: hidden;
`;

const ConnectedAppRow = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.color.global.row};
  border-radius: 0.5rem;
  padding: 0.5rem;
  margin: 0.25rem;
  width: 80%;
`;

const SettingsText = styled(Text)<WhiteLabelTheme>`
  color: ${({ theme }) => theme.color.global.contrast};
  margin: 0;
  font-weight: 600;
  text-align: left;
`;

const XIcon = styled.img`
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
`;

const AppIcon = styled.img`
  width: 3rem;
  height: 3rem;
  margin-right: 1rem;
  border-radius: 0.5rem;
`;

const ImageAndDomain = styled.div`
  display: flex;
  align-items: center;
`;

const ScrollableContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 25rem;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  padding: 1rem;
`;

const ExportKeysAsQrCodeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 1rem;
`;

const PageWrapper = styled.div<{ $marginTop: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: ${(props) => props.$marginTop};
  width: 100%;
`;

export type SettingsPage =
  | "main"
  | "manage-accounts"
  | "create-account"
  | "restore-account"
  | "import-wif"
  | "account-list"
  | "edit-account"
  | "connected-apps"
  | "social-profile"
  | "export-keys-options"
  | "export-keys-qr"
  | "preferences";
type DecisionType =
  | "sign-out"
  | "export-master-backup"
  | "export-keys"
  | "export-keys-qr-code"
  | "delete-account";

export const Settings = () => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const { query, handleSelect } = useBottomMenu();
  const [showSpeedBump, setShowSpeedBump] = useState(false);
  const { chromeStorageService, keysService, lockWallet, wallet } =
    useServiceContext();
  const [page, setPage] = useState<SettingsPage>(
    query === "manage-accounts" ? "manage-accounts" : "main",
  );
  const [connectedApps, setConnectedApps] = useState<WhitelistedApp[]>([]);
  const [speedBumpMessage, setSpeedBumpMessage] = useState("");
  const [decisionType, setDecisionType] = useState<DecisionType | undefined>();
  const { socialProfile, storeSocialProfile } =
    useSocialProfile(chromeStorageService);
  const [exportKeysQrData, setExportKeysAsQrData] = useState("");
  const [shouldVisibleExportedKeys, setShouldVisibleExportedKeys] =
    useState(false);
  const [enteredSocialDisplayName, setEnteredSocialDisplayName] = useState(
    socialProfile.displayName,
  );
  const [enteredAccountName, setEnteredAccountName] = useState("");
  const [enteredAccountIcon, setEnteredAccountIcon] = useState("");
  const [enteredSocialAvatar, setEnteredSocialAvatar] = useState(
    socialProfile?.avatar,
  );
  const [isPasswordRequired, setIsPasswordRequired] = useState(
    chromeStorageService.isPasswordRequired(),
  );
  const [masterBackupProgress, setMasterBackupProgress] = useState(0);
  const [masterBackupEventText, setMasterBackupEventText] = useState("");
  const currentAccount = chromeStorageService.getCurrentAccountObject();
  const [noApprovalLimit, setNoApprovalLimit] = useState(
    currentAccount.account?.settings.noApprovalLimit ?? 0,
  );
  const [customFeeRate, setCustomFeeRate] = useState(
    currentAccount.account?.settings.customFeeRate ?? FEE_PER_KB,
  );
  const [selectedAccountIdentityAddress, setSelectedAccountIdentityAddress] =
    useState<string | undefined>();

  useEffect(() => {
    const getWhitelist = async (): Promise<WhitelistedApp[]> => {
      try {
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!account) return [];
        const { whitelist } = account.settings;
        setConnectedApps(whitelist ?? []);
        return whitelist ?? [];
      } catch (error) {
        console.error(error);
        return [];
      }
    };

    getWhitelist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemoveDomain = async (domain: string) => {
    const newList = connectedApps.filter((app) => app.domain !== domain);
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) return [];
    const key: keyof ChromeStorageObject = "accounts";
    const update: Partial<ChromeStorageObject["accounts"]> = {
      [keysService.identityAddress]: {
        ...account,
        settings: {
          ...account.settings,
          whitelist: newList,
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
    setConnectedApps(newList);
  };

  const handleDeleteAccountIntent = () => {
    setDecisionType("delete-account");
    setSpeedBumpMessage(
      "Are you sure you want to delete this account? All keys and data will be lost.",
    );
    setShowSpeedBump(true);
  };

  const handleSignOutIntent = () => {
    setDecisionType("sign-out");
    setSpeedBumpMessage("Make sure you have your seed phrase backed up!");
    setShowSpeedBump(true);
  };

  const handleMasterBackupIntent = () => {
    setDecisionType("export-master-backup");
    setSpeedBumpMessage(
      "You are about to download wallet data for all your accounts. Make sure you are in a safe place.",
    );
    setShowSpeedBump(true);
  };

  const handleExportKeysIntent = () => {
    setDecisionType("export-keys");
    setSpeedBumpMessage(
      "You are about to download your private keys. Make sure you are in a safe place and no one is watching.",
    );
    setShowSpeedBump(true);
  };

  const handleExportKeysAsQrCodeIntent = () => {
    setDecisionType("export-keys-qr-code");
    setSpeedBumpMessage(
      "You are about to make your private keys visible in QR code format. Make sure you are in a safe place and no one is watching.",
    );
    setShowSpeedBump(true);
  };

  const handleSocialProfileSave = () => {
    storeSocialProfile({
      displayName: enteredSocialDisplayName,
      avatar: enteredSocialAvatar,
    });
    setPage("main");
  };

  const handleAccountEditSave = async () => {
    const accounts = chromeStorageService.getAllAccounts();
    const account = accounts.find(
      (acc) => acc.addresses.identityAddress === selectedAccountIdentityAddress,
    );
    if (!account || !selectedAccountIdentityAddress) return;
    const key: keyof ChromeStorageObject = "accounts";
    const update: Partial<ChromeStorageObject["accounts"]> = {
      [selectedAccountIdentityAddress]: {
        ...account,
        name: enteredAccountName,
        icon: enteredAccountIcon,
      },
    };
    await chromeStorageService.updateNested(key, update);
    setSelectedAccountIdentityAddress(undefined);
    setPage("main");
  };

  const handleDeleteAccount = async () => {
    if (!selectedAccountIdentityAddress) {
      addSnackbar("No account selected", "error");
      return;
    }
    const res = await chromeStorageService.getAndSetStorage();
    let accounts = chromeStorageService.getAllAccounts();
    if (accounts.length === 1) {
      addSnackbar("You cannot delete your only account", "error");
      return;
    }
    if (res?.selectedAccount === selectedAccountIdentityAddress) {
      addSnackbar(
        "You cannot delete the currently selected account. Switch to another account first.",
        "error",
      );
      return;
    }
    const key: keyof ChromeStorageObject = "accounts";
    indexedDB.deleteDatabase(
      `txos-${selectedAccountIdentityAddress}-${chromeStorageService.getNetwork()}`,
    );
    await chromeStorageService.removeNested(
      key,
      selectedAccountIdentityAddress,
    );
    await chromeStorageService.getAndSetStorage();
    accounts = chromeStorageService.getAllAccounts();
    await chromeStorageService.switchAccount(
      accounts[0].addresses.identityAddress,
    );
    setSelectedAccountIdentityAddress(undefined);
    setPage("main");
  };

  useEffect(() => {
    if (!socialProfile) return;
    setEnteredSocialDisplayName(socialProfile.displayName);
    setEnteredSocialAvatar(socialProfile.avatar);
  }, [socialProfile]);

  const exportKeys = async (password: string) => {
    const keys = await keysService.retrieveKeys(password);

    const keysToExport = {
      mnemonic: keys.mnemonic,
      payPk: keys.walletWif,
      payDerivationPath: keys.walletDerivationPath,
      ordPk: keys.ordWif,
      ordDerivationPath: keys.ordDerivationPath,
      identityPk: keys.identityWif,
      identityDerivationPath: keys.identityDerivationPath,
    };

    const jsonData = JSON.stringify(keysToExport, null, 2);
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const tempLink = document.createElement("a");
    tempLink.href = url;
    tempLink.setAttribute("download", "yours_wallet_keys.json");
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
    URL.revokeObjectURL(url);
  };

  const exportKeysAsQrCode = async (password: string) => {
    const keys = await keysService.retrieveKeys(password);

    const keysToExport = {
      mnemonic: keys.mnemonic,
      payPk: keys.walletWif,
      payDerivationPath: keys.walletDerivationPath,
      ordPk: keys.ordWif,
      ordDerivationPath: keys.ordDerivationPath,
    };

    const jsonData = JSON.stringify(keysToExport, null, 2);
    setExportKeysAsQrData(jsonData);

    setPage("export-keys-qr");
    setShouldVisibleExportedKeys(true);
    setTimeout(() => {
      setShouldVisibleExportedKeys(false);
    }, 10000);
  };

  const signOut = async () => {
    await chromeStorageService.clear();
    wallet?.close();
    setDecisionType(undefined);
    sendMessage({
      action: YoursEventName.SIGNED_OUT,
    });
    setTimeout(() => window.location.reload(), 100);
  };

  const handleCancel = () => {
    setShowSpeedBump(false);
  };

  const handleSpeedBumpConfirm = async (password?: string) => {
    if (decisionType === "sign-out") {
      signOut();
    }

    if (decisionType === "delete-account") {
      await handleDeleteAccount();
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }

    if (decisionType === "export-master-backup") {
      handleMasterBackup();
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }
    if (decisionType === "export-keys" && password) {
      exportKeys(password);
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }
    if (decisionType === "export-keys-qr-code" && password) {
      exportKeysAsQrCode(password);
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }
  };

  const handleUpdatePasswordRequirement = async (isRequired: boolean) => {
    setIsPasswordRequired(isRequired);
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) throw new Error("No account found");
    const accountSettings = account.settings;
    const key: keyof ChromeStorageObject = "accounts";
    const update: Partial<ChromeStorageObject["accounts"]> = {
      [keysService.identityAddress]: {
        ...account,
        settings: {
          ...accountSettings,
          isPasswordRequired: isRequired,
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
  };

  const handleUpdateApprovalLimit = async (amount: number) => {
    setNoApprovalLimit(amount);
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) throw new Error("No account found");
    const key: keyof ChromeStorageObject = "accounts";
    const update: Partial<ChromeStorageObject["accounts"]> = {
      [keysService.identityAddress]: {
        ...account,
        settings: {
          ...account.settings,
          noApprovalLimit: amount,
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
  };

  const handleUpdateCustomFeeRate = async (rate: number) => {
    if (rate < 1) {
      addSnackbar("Fee rate must be at least 1 sat/byte", "error");
      return;
    }
    setCustomFeeRate(rate);
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) throw new Error("No account found");
    const key: keyof ChromeStorageObject = "accounts";
    const update: Partial<ChromeStorageObject["accounts"]> = {
      [keysService.identityAddress]: {
        ...account,
        settings: {
          ...account.settings,
          customFeeRate: rate,
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
  };

  const handleMasterBackup = async () => {
    await streamDataToZip(
      chromeStorageService,
      (e: MasterBackupProgressEvent) => {
        setMasterBackupEventText(e.message);
        const progress =
          e.endValue && e.value ? Math.ceil((e.value / e.endValue) * 100) : 0;
        setMasterBackupProgress(progress);
      },
    );
    setMasterBackupEventText("");
  };

  const handleLockWallet = async () => {
    lockWallet();
    handleSelect("bsv");
  };

  const resyncUTXOs = async () => {
    addSnackbar("Syncing with cloud...", "info");
    try {
      const response = await chrome.runtime.sendMessage({ action: 'FULL_SYNC' });
      if (response.success) {
        const { pushed, pulled } = response.data;
        addSnackbar(
          `Sync complete: ↑${pushed.inserts}/${pushed.updates} ↓${pulled.inserts}/${pulled.updates}`,
          "success"
        );
      } else {
        addSnackbar(response.error || "Sync failed", "error");
      }
    } catch (error) {
      addSnackbar("Sync failed: " + (error instanceof Error ? error.message : String(error)), "error");
    }
  };

  const updateSpends = () => {
    // TODO: Migrate refreshSpends to OneSatWallet
    // oneSatSPV.stores.txos?.refreshSpends();
    addSnackbar("Update spends not yet available...", "info");
  };

  const main = (
    <>
      <SettingsRow
        name="Manage Accounts"
        description="Manage your accounts"
        onClick={() => setPage("manage-accounts")}
        jsxElement={<ForwardButton color={theme.color.global.contrast} />}
      />
      <SettingsRow
        name="Connected Apps"
        description="Manage the apps you are connected to"
        onClick={() => setPage("connected-apps")}
        jsxElement={<ForwardButton color={theme.color.global.contrast} />}
      />
      <SettingsRow
        name="Preferences"
        description="Manage your wallet preferences"
        onClick={() => setPage("preferences")}
        jsxElement={<ForwardButton color={theme.color.global.contrast} />}
      />
      <SettingsRow
        name="Export Keys"
        description="Download keys or export as QR code"
        onClick={() => setPage("export-keys-options")}
        jsxElement={<ForwardButton color={theme.color.global.contrast} />}
      />
      <SettingsRow
        name="Re-Sync UTXOs"
        description="Re-sync your wallets spendable coins"
        onClick={resyncUTXOs}
      />
      <SettingsRow
        name="Update Spends"
        description="Update your wallet's spent coins"
        onClick={updateSpends}
      />
      <SettingsRow
        name="Lock Wallet"
        description="Immediately lock the wallet"
        onClick={handleLockWallet}
      />
      <Text
        style={{
          margin: "1rem 0",
          textAlign: "left",
          color: theme.color.global.contrast,
          fontSize: "1rem",
          fontWeight: 700,
        }}
        theme={theme}
      >
        Danger Zone
      </Text>
      <SettingsRow
        style={{
          backgroundColor: theme.color.component.warningButton + "40",
          border: "1px solid " + theme.color.component.warningButton,
        }}
        name="Sign Out"
        description={`Sign out of ${theme.settings.walletName} Wallet completely`}
        onClick={handleSignOutIntent}
      />
    </>
  );

  const manageAccountsPage = (
    <>
      <SettingsRow
        name="Create Account"
        description="Create a new account"
        jsxElement={<ForwardButton color={theme.color.global.contrast} />}
        onClick={() => setPage("create-account")}
      />
      <SettingsRow
        name="Restore/Import"
        description="Import or restore an existing account"
        jsxElement={<ForwardButton color={theme.color.global.contrast} />}
        onClick={() => setPage("restore-account")}
      />
      <SettingsRow
        name="Edit Account"
        description="Edit an existing account"
        jsxElement={<ForwardButton color={theme.color.global.contrast} />}
        onClick={() => setPage("account-list")}
      />
      <Button
        theme={theme}
        type="secondary"
        label={"Go back"}
        onClick={() => setPage("main")}
      />
    </>
  );

  const connectedAppsPage = (
    <PageWrapper $marginTop={connectedApps.length === 0 ? "10rem" : "-1rem"}>
      <Show
        when={connectedApps.length > 0}
        whenFalseContent={<Text theme={theme}>No apps connected</Text>}
      >
        <ScrollableContainer>
          {connectedApps.map((app, idx) => {
            return (
              <ConnectedAppRow key={app.domain + idx} theme={theme}>
                <ImageAndDomain>
                  <AppIcon src={app.icon} />
                  <SettingsText theme={theme}>{app.domain}</SettingsText>
                </ImageAndDomain>
                <XIcon src={x} onClick={() => handleRemoveDomain(app.domain)} />
              </ConnectedAppRow>
            );
          })}
        </ScrollableContainer>
      </Show>
      <Button
        theme={theme}
        type="secondary"
        label={"Go back"}
        onClick={() => setPage("main")}
      />
    </PageWrapper>
  );

  const exportKeysAsQrCodePage = (
    <>
      <Show
        when={shouldVisibleExportedKeys}
        whenFalseContent={
          <Text theme={theme}>Timed out. Please try again</Text>
        }
      >
        <ExportKeysAsQrCodeContainer>
          <QrCode address={exportKeysQrData} />
        </ExportKeysAsQrCodeContainer>
      </Show>
      <Button
        theme={theme}
        type="secondary"
        label={"Go back"}
        onClick={() => setPage("main")}
      />
    </>
  );

  const exportKeyOptionsPage = (
    <>
      <SettingsRow
        name="Master Backup"
        description="Download all wallet data for all accounts. Use this to restore your wallet on another device."
        onClick={masterBackupEventText ? () => null : handleMasterBackupIntent}
        masterBackupText={masterBackupEventText}
        masterBackupProgress={masterBackupProgress}
      />
      <Show when={!masterBackupEventText}>
        <SettingsRow
          name="Download Keys"
          description="Download your seed, private, and public keys for current account"
          onClick={handleExportKeysIntent}
        />
        <SettingsRow
          name="Export Keys as QR code"
          description="Display private keys for current account as QR code for mobile import"
          onClick={handleExportKeysAsQrCodeIntent}
        />
      </Show>
      <Button
        theme={theme}
        style={{
          color: masterBackupEventText
            ? theme.color.component.snackbarError
            : undefined,
          width: masterBackupEventText ? "80%" : undefined,
        }}
        type="secondary"
        label={
          masterBackupEventText
            ? "DO NOT CLOSE WALLET OR CHANGE TABS DURING THIS PROCESS!"
            : "Go back"
        }
        onClick={() => (masterBackupEventText ? null : setPage("main"))}
      />
    </>
  );

  const preferencesPage = (
    <>
      <SettingsRow
        name="Social Profile"
        description="Set your display name and avatar"
        onClick={() => setPage("social-profile")}
        jsxElement={<ForwardButton color={theme.color.global.contrast} />}
      />
      <SettingsRow
        name="Require Password"
        description="Require a password for sending assets?"
        jsxElement={
          <ToggleSwitch
            theme={theme}
            on={isPasswordRequired}
            onChange={() =>
              handleUpdatePasswordRequirement(!isPasswordRequired)
            }
          />
        }
      />
      <SettingsRow
        name="Auto Approve Limit"
        description="Transactions at or below this BSV amount will be auto approved."
        jsxElement={
          <Input
            theme={theme}
            placeholder={String(noApprovalLimit)}
            type="number"
            onChange={(e) => handleUpdateApprovalLimit(Number(e.target.value))}
            value={noApprovalLimit}
            style={{ width: "5rem", margin: 0 }}
          />
        }
      />
      <SettingsRow
        name="Custom Fee Rate"
        description="Set a custom fee rate for transactions (default is 100 sat/kb)"
        jsxElement={
          <Input
            theme={theme}
            placeholder={String(customFeeRate)}
            type="number"
            onChange={(e) => handleUpdateCustomFeeRate(Number(e.target.value))}
            value={customFeeRate}
            style={{ width: "5rem", margin: 0 }}
          />
        }
      />
      <Button
        theme={theme}
        type="secondary"
        label={"Go back"}
        onClick={() => setPage("main")}
      />
    </>
  );

  const socialProfilePage = (
    <PageWrapper $marginTop="5rem">
      <SettingsText theme={theme}>Display Name</SettingsText>
      <Input
        theme={theme}
        placeholder="Display Name"
        type="text"
        onChange={(e) => setEnteredSocialDisplayName(e.target.value)}
        value={enteredSocialDisplayName}
      />
      <SettingsText theme={theme}>Avatar</SettingsText>
      <Input
        theme={theme}
        placeholder="Avatar Url"
        type="text"
        onChange={(e) => setEnteredSocialAvatar(e.target.value)}
        value={enteredSocialAvatar}
      />
      <Button
        theme={theme}
        type="primary"
        label="Save"
        style={{ marginTop: "1rem" }}
        onClick={handleSocialProfileSave}
      />
      <Button
        theme={theme}
        type="secondary"
        label={"Go back"}
        onClick={() => setPage("preferences")}
      />
    </PageWrapper>
  );

  const accountList = (
    <>
      {chromeStorageService.getAllAccounts().map((account) => {
        return (
          <AccountRow
            key={account.addresses.identityAddress}
            name={account.name}
            icon={account.icon}
            jsxElement={<ForwardButton color={theme.color.global.contrast} />}
            onClick={() => {
              setSelectedAccountIdentityAddress(
                account.addresses.identityAddress,
              );
              setEnteredAccountName(account.name);
              setEnteredAccountIcon(account.icon);
              setPage("edit-account");
            }}
          />
        );
      })}
      <Button
        theme={theme}
        type="secondary"
        label={"Go back"}
        onClick={() => setPage("manage-accounts")}
      />
    </>
  );

  const editAccount = (
    <>
      <PageWrapper $marginTop="5rem">
        <SettingsText theme={theme}>Label</SettingsText>
        <Input
          theme={theme}
          placeholder="Account Label"
          type="text"
          onChange={(e) => setEnteredAccountName(e.target.value)}
          value={enteredAccountName}
        />
        <SettingsText theme={theme}>Icon</SettingsText>
        <Input
          theme={theme}
          placeholder="Account Icon"
          type="text"
          onChange={(e) => setEnteredAccountIcon(e.target.value)}
          value={enteredAccountIcon}
        />
        <Button
          theme={theme}
          type="primary"
          label="Save"
          style={{ marginTop: "1rem" }}
          onClick={handleAccountEditSave}
        />
        <Button
          theme={theme}
          type="warn"
          label="Delete"
          onClick={handleDeleteAccountIntent}
        />
        <Button
          theme={theme}
          type="secondary"
          label={"Go back"}
          onClick={() => {
            setSelectedAccountIdentityAddress(undefined);
            setPage("account-list");
          }}
        />
      </PageWrapper>
    </>
  );

  return (
    <Show
      when={!showSpeedBump}
      whenFalseContent={
        <SpeedBump
          theme={theme}
          message={speedBumpMessage}
          onCancel={handleCancel}
          onConfirm={(password?: string) => handleSpeedBumpConfirm(password)}
          showSpeedBump={showSpeedBump}
          withPassword={
            decisionType === "delete-account" ||
            decisionType === "export-keys" ||
            decisionType === "export-keys-qr-code" ||
            decisionType === "export-master-backup"
          }
        />
      }
    >
      <Content>
        <TopNav />
        <Show when={page === "main"}>{main}</Show>
        <Show when={page === "manage-accounts"}>{manageAccountsPage}</Show>
        <Show when={page === "create-account"}>
          <PageWrapper $marginTop="3rem">
            <CreateAccount onNavigateBack={() => setPage("manage-accounts")} />
          </PageWrapper>
        </Show>
        <Show when={page === "restore-account"}>
          <PageWrapper $marginTop="1rem">
            <RestoreAccount
              onNavigateBack={(page: SettingsPage) => setPage(page)}
            />
          </PageWrapper>
        </Show>
        <Show when={page === "import-wif"}>
          <PageWrapper $marginTop="1rem">
            <ImportAccount onNavigateBack={() => setPage("restore-account")} />
          </PageWrapper>
        </Show>
        <Show when={page === "account-list"}>{accountList}</Show>
        <Show when={page === "edit-account"}>{editAccount}</Show>
        <Show when={page === "connected-apps"}>{connectedAppsPage}</Show>
        <Show when={page === "preferences"}>{preferencesPage}</Show>
        <Show when={page === "social-profile"}>{socialProfilePage}</Show>
        <Show when={page === "export-keys-options"}>
          {exportKeyOptionsPage}
        </Show>
        <Show when={page === "export-keys-qr"}>{exportKeysAsQrCodePage}</Show>
      </Content>
    </Show>
  );
};
