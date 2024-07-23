import { useEffect, useState } from 'react';
import styled from 'styled-components';
import x from '../assets/x.svg';
import { Button } from '../components/Button';
import { ForwardButton } from '../components/ForwardButton';
import { Input } from '../components/Input';
import { QrCode } from '../components/QrCode';
import { Text } from '../components/Reusable';
import { SettingsRow } from '../components/SettingsRow';
import { Show } from '../components/Show';
import { SpeedBump } from '../components/SpeedBump';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { TopNav } from '../components/TopNav';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useSocialProfile } from '../hooks/useSocialProfile';
import { useTheme } from '../hooks/useTheme';
import { useServiceContext } from '../hooks/useServiceContext';
import { WhitelistedApp } from '../inject';
import { ColorThemeProps } from '../theme';
import { sendMessage } from '../utils/chromeHelpers';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { CreateAccount } from './onboarding/CreateAccount';
import { RestoreAccount } from './onboarding/RestoreAccount';
import { ImportAccount } from './onboarding/ImportAccount';
import { AccountRow } from '../components/AccountRow';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: calc(75%);
  overflow-y: auto;
  overflow-x: hidden;
`;

const ConnectedAppRow = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.darkAccent};
  border-radius: 0.5rem;
  padding: 0.5rem;
  margin: 0.25rem;
  width: 80%;
`;

const SettingsText = styled(Text)<ColorThemeProps>`
  color: ${({ theme }) => theme.white};
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
  | 'main'
  | 'manage-accounts'
  | 'create-account'
  | 'restore-account'
  | 'import-wif'
  | 'account-list'
  | 'edit-account'
  | 'connected-apps'
  | 'social-profile'
  | 'export-keys-options'
  | 'export-keys-qr'
  | 'preferences';
type DecisionType = 'sign-out' | 'export-keys' | 'export-keys-qr-code';

export const Settings = () => {
  const { theme } = useTheme();
  const { setSelected, query } = useBottomMenu();
  const [showSpeedBump, setShowSpeedBump] = useState(false);
  const { chromeStorageService, keysService, lockWallet } = useServiceContext();
  const [page, setPage] = useState<SettingsPage>(query === 'manage-accounts' ? 'manage-accounts' : 'main');
  const [connectedApps, setConnectedApps] = useState<WhitelistedApp[]>([]);
  const [speedBumpMessage, setSpeedBumpMessage] = useState('');
  const [decisionType, setDecisionType] = useState<DecisionType | undefined>();
  const { socialProfile, storeSocialProfile } = useSocialProfile(chromeStorageService);
  const [exportKeysQrData, setExportKeysAsQrData] = useState('');
  const [shouldVisibleExportedKeys, setShouldVisibleExportedKeys] = useState(false);
  const [enteredSocialDisplayName, setEnteredSocialDisplayName] = useState(socialProfile.displayName);
  const [enteredAccountName, setEnteredAccountName] = useState('');
  const [enteredAccountIcon, setEnteredAccountIcon] = useState('');
  const [enteredSocialAvatar, setEnteredSocialAvatar] = useState(socialProfile?.avatar);
  const [isPasswordRequired, setIsPasswordRequired] = useState(chromeStorageService.isPasswordRequired());
  const [noApprovalLimit, setNoApprovalLimit] = useState(
    chromeStorageService.getCurrentAccountObject().account?.settings.noApprovalLimit ?? 0,
  );

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
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
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

  const handleSignOutIntent = () => {
    setDecisionType('sign-out');
    setSpeedBumpMessage('Make sure you have your seed phrase backed up!');
    setShowSpeedBump(true);
  };

  const handleExportKeysIntent = () => {
    setDecisionType('export-keys');
    setSpeedBumpMessage(
      'You are about to download your private keys. Make sure you are in a safe place and no one is watching.',
    );
    setShowSpeedBump(true);
  };

  const handleExportKeysAsQrCodeIntent = () => {
    setDecisionType('export-keys-qr-code');
    setSpeedBumpMessage(
      'You are about to make your private keys visible in QR code format. Make sure you are in a safe place and no one is watching.',
    );
    setShowSpeedBump(true);
  };

  const handleSocialProfileSave = () => {
    storeSocialProfile({
      displayName: enteredSocialDisplayName,
      avatar: enteredSocialAvatar,
    });
    setPage('main');
  };

  const handleAccountEditSave = async () => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) return;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [account?.addresses.identityAddress]: {
        ...account,
        name: enteredAccountName,
        icon: enteredAccountIcon,
      },
    };
    await chromeStorageService.updateNested(key, update);
    setPage('main');
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
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const tempLink = document.createElement('a');
    tempLink.href = url;
    tempLink.setAttribute('download', 'yours_wallet_keys.json');
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

    setPage('export-keys-qr');
    setShouldVisibleExportedKeys(true);
    setTimeout(() => {
      setShouldVisibleExportedKeys(false);
    }, 10000);
  };

  const signOut = async () => {
    await chromeStorageService.clear();
    setDecisionType(undefined);
    window.location.reload();

    sendMessage({
      action: 'signedOut',
    });
  };

  const handleCancel = () => {
    setShowSpeedBump(false);
  };

  useEffect(() => {
    setSelected('settings');
  }, [setSelected]);

  const handleSpeedBumpConfirm = (password?: string) => {
    if (decisionType === 'sign-out') {
      // TODO: export master storage object with all necessary data to restore full wallet state for all accounts. Be sure to include decrypted password.
      signOut();
    }

    if (decisionType === 'export-keys' && password) {
      exportKeys(password);
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }
    if (decisionType === 'export-keys-qr-code' && password) {
      exportKeysAsQrCode(password);
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }
  };

  const handleUpdatePasswordRequirement = async (isRequired: boolean) => {
    setIsPasswordRequired(isRequired);
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) throw new Error('No account found');
    const accountSettings = account.settings;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
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
    if (!account) throw new Error('No account found');
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
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

  const main = (
    <>
      <SettingsRow
        name="Manage Accounts"
        description="Manage your accounts"
        onClick={() => setPage('manage-accounts')}
        jsxElement={<ForwardButton />}
      />
      <SettingsRow
        name="Connected Apps"
        description="Manage the apps you are connected to"
        onClick={() => setPage('connected-apps')}
        jsxElement={<ForwardButton />}
      />
      <SettingsRow
        name="Preferences"
        description="Manage your wallet preferences"
        onClick={() => setPage('preferences')}
        jsxElement={<ForwardButton />}
      />
      <SettingsRow
        name="Export Keys"
        description="Download keys or export as QR code"
        onClick={() => setPage('export-keys-options')}
        jsxElement={<ForwardButton />}
      />
      <SettingsRow name="Lock Wallet" description="Immediately lock the wallet" onClick={lockWallet} />
      <Text
        style={{
          margin: '1rem 0',
          textAlign: 'left',
          color: theme.white,
          fontSize: '1rem',
          fontWeight: 700,
        }}
        theme={theme}
      >
        Danger Zone
      </Text>
      <SettingsRow
        style={{ backgroundColor: theme.errorRed + '40', border: '1px solid ' + theme.errorRed }}
        name="Sign Out"
        description="Sign out of Yours Wallet completely"
        onClick={handleSignOutIntent}
      />
    </>
  );

  const manageAccountsPage = (
    <>
      <SettingsRow
        name="Create Account"
        description="Create a new account"
        jsxElement={<ForwardButton />}
        onClick={() => setPage('create-account')}
      />
      <SettingsRow
        name="Restore/Import"
        description="Import or restore an existing account"
        jsxElement={<ForwardButton />}
        onClick={() => setPage('restore-account')}
      />
      <SettingsRow
        name="Edit Account"
        description="Edit an existing account"
        jsxElement={<ForwardButton />}
        onClick={() => setPage('account-list')}
      />
      <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('main')} />
    </>
  );

  const connectedAppsPage = (
    <PageWrapper $marginTop={connectedApps.length === 0 ? '10rem' : '-1rem'}>
      <Show when={connectedApps.length > 0} whenFalseContent={<Text theme={theme}>No apps connected</Text>}>
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
      <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('main')} />
    </PageWrapper>
  );

  const exportKeysAsQrCodePage = (
    <>
      <Show when={shouldVisibleExportedKeys} whenFalseContent={<Text theme={theme}>Timed out. Please try again</Text>}>
        <ExportKeysAsQrCodeContainer>
          <QrCode address={exportKeysQrData} />
        </ExportKeysAsQrCodeContainer>
      </Show>
      <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('main')} />
    </>
  );

  const exportKeyOptionsPage = (
    <>
      <SettingsRow
        name="Download Keys"
        description="Download your seed, private, and public keys"
        onClick={handleExportKeysIntent}
      />
      <SettingsRow
        name="Export Keys as QR code"
        description="Display private keys as QR code for mobile import"
        onClick={handleExportKeysAsQrCodeIntent}
      />
      <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('main')} />
    </>
  );

  const preferencesPage = (
    <>
      <SettingsRow
        name="Social Profile"
        description="Set your display name and avatar"
        onClick={() => setPage('social-profile')}
        jsxElement={<ForwardButton />}
      />
      <SettingsRow
        name="Require Password"
        description="Require a password for sending assets?"
        jsxElement={
          <ToggleSwitch
            theme={theme}
            on={isPasswordRequired}
            onChange={() => handleUpdatePasswordRequirement(!isPasswordRequired)}
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
            style={{ width: '5rem', margin: 0 }}
          />
        }
      />
      <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('main')} />
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
        style={{ marginTop: '1rem' }}
        onClick={handleSocialProfileSave}
      />
      <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('preferences')} />
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
            jsxElement={<ForwardButton />}
            onClick={() => {
              setEnteredAccountName(account.name);
              setEnteredAccountIcon(account.icon);
              setPage('edit-account');
            }}
          />
        );
      })}
      <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('manage-accounts')} />
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
          style={{ marginTop: '1rem' }}
          onClick={handleAccountEditSave}
        />
        <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('account-list')} />
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
          withPassword={decisionType === 'export-keys' || decisionType === 'export-keys-qr-code'}
        />
      }
    >
      <Content>
        <TopNav />
        <Show when={page === 'main'}>{main}</Show>
        <Show when={page === 'manage-accounts'}>{manageAccountsPage}</Show>
        <Show when={page === 'create-account'}>
          <PageWrapper $marginTop="3rem">
            <CreateAccount onNavigateBack={() => setPage('manage-accounts')} />
          </PageWrapper>
        </Show>
        <Show when={page === 'restore-account'}>
          <PageWrapper $marginTop="1rem">
            <RestoreAccount onNavigateBack={(page: SettingsPage) => setPage(page)} />
          </PageWrapper>
        </Show>
        <Show when={page === 'import-wif'}>
          <PageWrapper $marginTop="1rem">
            <ImportAccount onNavigateBack={() => setPage('restore-account')} />
          </PageWrapper>
        </Show>
        <Show when={page === 'account-list'}>{accountList}</Show>
        <Show when={page === 'edit-account'}>{editAccount}</Show>
        <Show when={page === 'connected-apps'}>{connectedAppsPage}</Show>
        <Show when={page === 'preferences'}>{preferencesPage}</Show>
        <Show when={page === 'social-profile'}>{socialProfilePage}</Show>
        <Show when={page === 'export-keys-options'}>{exportKeyOptionsPage}</Show>
        <Show when={page === 'export-keys-qr'}>{exportKeysAsQrCodePage}</Show>
      </Content>
    </Show>
  );
};
