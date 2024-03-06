import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { WhitelistedApp } from '../App';
import x from '../assets/x.svg';
import { BackButton } from '../components/BackButton';
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
import { useKeys } from '../hooks/useKeys';
import { useSnackbar } from '../hooks/useSnackbar';
import { useSocialProfile } from '../hooks/useSocialProfile';
import { useTheme } from '../hooks/useTheme';
import { useWalletLockState } from '../hooks/useWalletLockState';
import { useWeb3Context } from '../hooks/useWeb3Context';
import { ColorThemeProps } from '../theme';
import { SNACKBAR_TIMEOUT } from '../utils/constants';
import { NetWork } from '../utils/network';
import { storage } from '../utils/storage';

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

type SettingsPage =
  | 'main'
  | 'connected-apps'
  | 'social-profile'
  | 'export-keys-options'
  | 'export-keys-qr'
  | 'preferences';
type DecisionType = 'sign-out' | 'export-keys' | 'export-keys-qr-code';

export const Settings = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const { lockWallet } = useWalletLockState();
  const [showSpeedBump, setShowSpeedBump] = useState(false);
  const { addSnackbar } = useSnackbar();
  const {
    network,
    updateNetwork,
    isPasswordRequired,
    updatePasswordRequirement,
    updateNoApprovalLimit,
    noApprovalLimit,
  } = useWeb3Context();
  const [page, setPage] = useState<SettingsPage>('main');
  const [connectedApps, setConnectedApps] = useState<WhitelistedApp[]>([]);
  const [speedBumpMessage, setSpeedBumpMessage] = useState('');
  const [decisionType, setDecisionType] = useState<DecisionType | undefined>();
  const { retrieveKeys } = useKeys();
  const { socialProfile, storeSocialProfile } = useSocialProfile();
  const [exportKeysQrData, setExportKeysAsQrData] = useState('');
  const [shouldVisibleExportedKeys, setShouldVisibleExportedKeys] = useState(false);

  const [enteredSocialDisplayName, setEnteredSocialDisplayName] = useState(socialProfile.displayName);
  const [enteredSocialAvatar, setEnteredSocialAvatar] = useState(socialProfile?.avatar);

  useEffect(() => {
    const getWhitelist = (): Promise<string[]> => {
      return new Promise((resolve, reject) => {
        storage.get(['whitelist'], async (result) => {
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
    const newList = connectedApps.filter((app) => app.domain !== domain);
    storage.set({ whitelist: newList });
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

  useEffect(() => {
    if (!socialProfile) return;
    setEnteredSocialDisplayName(socialProfile.displayName);
    setEnteredSocialAvatar(socialProfile.avatar);
  }, [socialProfile]);

  const exportKeys = async (password: string) => {
    const keys = await retrieveKeys(password);

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
    tempLink.setAttribute('download', 'panda_wallet_keys.json');
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
    URL.revokeObjectURL(url);
  };

  const exportKeysAsQrCode = async (password: string) => {
    const keys = await retrieveKeys(password);

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
    await storage.clear();
    setDecisionType(undefined);
    window.location.reload();
  };

  const handleCancel = () => {
    setShowSpeedBump(false);
  };

  useEffect(() => {
    setSelected('settings');
  }, [setSelected]);

  const handleNetworkChange = (e: any) => {
    const network = e.target.checked ? NetWork.Testnet : NetWork.Mainnet;
    updateNetwork(network);

    // The provider relies on appState in local storage to accurately return addresses. This is an easy way to handle making sure the state is always up to date.
    addSnackbar(`Switching to ${network}`, 'info');
    setTimeout(() => {
      window.location.reload();
    }, SNACKBAR_TIMEOUT - 500);
  };

  const handleSpeedBumpConfirm = (password?: string) => {
    if (decisionType === 'sign-out') {
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

  const main = (
    <>
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
        name="Testnet Mode"
        description="Applies to balances and app connections"
        jsxElement={<ToggleSwitch theme={theme} on={network === NetWork.Testnet} onChange={handleNetworkChange} />}
      />
      <SettingsRow
        name="Export Keys"
        description="Download keys or export as QR code"
        onClick={() => setPage('export-keys-options')}
        jsxElement={<ForwardButton />}
      />

      <SettingsRow name="Lock Wallet" description="Immediately lock the wallet" onClick={lockWallet} />
      <SettingsRow name="Sign Out" description="Sign out of Panda Wallet completely" onClick={handleSignOutIntent} />
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
            onChange={() => updatePasswordRequirement(!isPasswordRequired)}
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
            onChange={(e) => updateNoApprovalLimit(Number(e.target.value))}
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
      <BackButton onClick={() => setPage('preferences')} />
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
    </PageWrapper>
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
        <Show when={page === 'connected-apps'}>{connectedAppsPage}</Show>
        <Show when={page === 'preferences'}>{preferencesPage}</Show>
        <Show when={page === 'social-profile'}>{socialProfilePage}</Show>
        <Show when={page === 'export-keys-options'}>{exportKeyOptionsPage}</Show>
        <Show when={page === 'export-keys-qr'}>{exportKeysAsQrCodePage}</Show>
      </Content>
    </Show>
  );
};
