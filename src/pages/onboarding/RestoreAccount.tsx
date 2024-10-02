import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import relayXLogo from '../../assets/relayx.svg';
import twetchLogo from '../../assets/twetch.svg';
import yoursWhiteLogo from '../../assets/logos/white-logo.png';
import otherWallet from '../../assets/other-wallet.svg';
import wifWallet from '../../assets/wif-wallet.svg';
import masterWallet from '../../assets/master-wallet.svg';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { WalletRow } from '../../components/WalletRow';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { WhiteLabelTheme } from '../../theme.types';
import { sleep } from '../../utils/sleep';
import { useServiceContext } from '../../hooks/useServiceContext';
import { SupportedWalletImports } from '../../services/types/keys.types';
import { NetWork } from 'yours-wallet-provider';
import { SettingsPage } from '../Settings';
import { YoursIcon } from '../../components/YoursIcon';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
`;

const SeedInput = styled.textarea<WhiteLabelTheme & { $isExpert: boolean }>`
  background-color: ${({ theme }) => theme.color.global.row};
  border-radius: 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.global.gray + '50'};
  width: 80%;
  height: 4rem;
  font-size: 0.85rem;
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  padding: 1rem;
  margin: 0.5rem;
  outline: none;
  color: ${({ theme }) =>
    theme.color.global.primaryTheme === 'dark' ? theme.color.global.contrast : theme.color.global.neutral + '80'};
  resize: none;

  &::placeholder {
    color: ${({ theme }) =>
      theme.color.global.primaryTheme === 'dark' ? theme.color.global.contrast : theme.color.global.neutral + '80'};
  }
`;

const ExpertImportWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 90%;
`;

const WalletWrapper = styled.div`
  display: flex;
  align-items: center;
`;

const YoursWalletContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #000000;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0.5rem;
  border-radius: 0.5rem;
`;

const WalletLogo = styled.img`
  width: auto;
  height: 2.25rem;
`;

const WalletText = styled(Text)`
  margin: 0 0 0 1rem;
  text-align: left;
  color: ${({ theme }) =>
    theme.color.global.primaryTheme === 'dark' ? theme.color.global.contrast : theme.color.global.neutral};
  font-weight: 600;
`;

export type RestoreAccountProps = {
  onNavigateBack: (page: SettingsPage) => void;
  newWallet?: boolean;
};

export const RestoreAccount = ({ onNavigateBack, newWallet = false }: RestoreAccountProps) => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [step, setStep] = useState(1);
  const [seedWords, setSeedWords] = useState<string>('');
  const { addSnackbar } = useSnackbar();
  const { hideMenu, showMenu } = useBottomMenu();
  const [loading, setLoading] = useState(false);
  const [isExpertImport, setIsExpertImport] = useState(false);
  const [importWallet, setImportWallet] = useState<SupportedWalletImports | undefined>();
  const [walletDerivation, setWalletDerivation] = useState<string | null>(null);
  const [ordDerivation, setOrdDerivation] = useState<string | null>(null);
  const [identityDerivation, setIdentityDerivation] = useState<string | null>(null);
  const { keysService, chromeStorageService } = useServiceContext();

  useEffect(() => {
    newWallet && hideMenu();

    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu, newWallet]);

  const handleExpertToggle = () => setIsExpertImport(!isExpertImport);

  const handleRestore = async (event: React.FormEvent<HTMLFormElement>) => {
    try {
      event.preventDefault();
      setLoading(true);
      if (password.length < 8) {
        addSnackbar(newWallet ? 'The password must be at least 8 characters!' : 'Invalid Password!', 'error');
        return;
      }

      if (newWallet && password !== passwordConfirm) {
        addSnackbar('The passwords do not match!', 'error');
        return;
      }

      // Some artificial delay for the loader
      await sleep(50);
      const keys = await keysService.generateSeedAndStoreEncrypted(
        password,
        newWallet,
        NetWork.Mainnet,
        seedWords,
        walletDerivation,
        ordDerivation,
        identityDerivation,
        importWallet,
      );
      if (!keys?.mnemonic) {
        addSnackbar('An error occurred while creating the account! Make sure your password is correct.', 'error');
        return;
      }

      const chromeObject = await chromeStorageService.getAndSetStorage();
      if (!chromeObject?.accounts) throw new Error('No accounts found!');
      const objKeys = Object.keys(chromeObject.accounts);
      if (!objKeys) throw new Error('Object identity address not found');
      await chromeStorageService.switchAccount(keys.identityAddress);

      if (!newWallet) return window.location.reload(); // no need to show success screen for existing wallets
      setStep(4);
    } catch (error) {
      console.log(error);
      addSnackbar('An error occurred while restoring the account!', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleWalletSelection = (wallet?: SupportedWalletImports) => {
    setImportWallet(wallet);
    if (wallet === 'wif') {
      newWallet ? navigate('/import-wallet') : onNavigateBack('import-wif');
      return;
    }
    if (newWallet && wallet === 'master') {
      navigate('/master-restore');
      return;
    }
    setStep(2);
  };

  const getRestoreTitle = () => {
    return importWallet === 'yours'
      ? `Restore ${theme.settings.walletName} wallet`
      : importWallet === 'panda'
        ? 'Restore Panda wallet'
        : importWallet === 'relayx'
          ? 'Restore Relay wallet'
          : importWallet === 'twetch'
            ? 'Restore Twetch wallet'
            : 'Restore wallet';
  };

  const getRestoreDescription = () => {
    return importWallet
      ? 'Enter your seed phrase'
      : 'Enter a seed phrase and use custom derivation paths to import a wallet from anywhere!';
  };

  const passwordStep = (
    <>
      <HeaderText theme={theme}>{newWallet ? 'Create password' : 'Import Account'}</HeaderText>
      <Text theme={theme}>
        {newWallet ? 'This will be used to unlock your wallet.' : 'Enter your existing password.'}
      </Text>
      <FormContainer onSubmit={handleRestore}>
        <Input
          theme={theme}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Show when={newWallet}>
          <Input
            theme={theme}
            placeholder="Confirm Password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            style={{ marginBottom: '2rem' }}
          />
        </Show>
        <Button theme={theme} type="primary" label="Finish" disabled={loading} isSubmit />
        <Button theme={theme} type="secondary" label="Go back" onClick={() => setStep(2)} />
      </FormContainer>
    </>
  );

  const enterSeedStep = (
    <>
      <HeaderText theme={theme}>{getRestoreTitle()}</HeaderText>
      <Text theme={theme} style={{ marginBottom: '1rem', width: '90%' }}>
        {getRestoreDescription()}
      </Text>
      <FormContainer onSubmit={() => setStep(3)}>
        <SeedInput
          theme={theme}
          placeholder="Enter secret recovery words"
          onChange={(e) => setSeedWords(e.target.value)}
          $isExpert={isExpertImport}
        />
        <Show when={isExpertImport}>
          <Input
            theme={theme}
            placeholder="Wallet Derivation ex. m/44'/236'/0'/0/0"
            type="text"
            value={walletDerivation ?? ''}
            onChange={(e) => setWalletDerivation(e.target.value)}
            style={{ margin: '0.1rem', width: '85%' }}
          />
          <Input
            theme={theme}
            placeholder="Ordinal Derivation ex. m/44'/236'/1'/0/0"
            type="text"
            value={ordDerivation ?? ''}
            onChange={(e) => setOrdDerivation(e.target.value)}
            style={{ margin: '0.1rem', width: '85%' }}
          />
          <Input
            theme={theme}
            placeholder="Identity Derivation ex. m/0'/236'/0'/0/0"
            type="text"
            value={identityDerivation ?? ''}
            onChange={(e) => setIdentityDerivation(e.target.value)}
            style={{ margin: '0.1rem 0 1rem', width: '85%' }}
          />
        </Show>
        <Show when={importWallet === 'other'}>
          <ExpertImportWrapper>
            <ToggleSwitch theme={theme} on={isExpertImport} onChange={handleExpertToggle} />
            <Text theme={theme} style={{ margin: '0 0 0 0.5rem', textAlign: 'left' }}>
              Use custom derivations
            </Text>
          </ExpertImportWrapper>
        </Show>
        <Text theme={theme} style={{ margin: '1rem 0 1rem' }}>
          Make sure you are in a safe place and no one is watching.
        </Text>
        <Button theme={theme} type="primary" label="Next" isSubmit />
        <Button theme={theme} type="secondary" label="Go back" onClick={() => setStep(1)} />
      </FormContainer>
    </>
  );

  const availableWallets = (wallets: (SupportedWalletImports | undefined)[]) => {
    return wallets.map((wallet) => {
      return (
        !!wallet && (
          <WalletRow
            key={window.crypto.randomUUID()}
            onClick={() => handleWalletSelection(wallet)}
            element={
              <>
                <Show when={wallet === 'yours'}>
                  <WalletWrapper>
                    <YoursWalletContainer theme={theme}>
                      <WalletLogo src={yoursWhiteLogo} style={{ width: '1rem', height: 'auto' }} />
                    </YoursWalletContainer>
                    <WalletText theme={theme}>{theme.settings.walletName}</WalletText>
                  </WalletWrapper>
                </Show>
                <Show when={wallet === 'relayx'}>
                  <WalletWrapper>
                    <WalletLogo src={relayXLogo} />
                    <WalletText theme={theme}>RelayX</WalletText>
                  </WalletWrapper>
                </Show>
                <Show when={wallet === 'twetch'}>
                  <WalletWrapper>
                    <WalletLogo src={twetchLogo} />
                    <WalletText theme={theme}>Twetch</WalletText>
                  </WalletWrapper>
                </Show>
                <Show when={wallet === 'other'}>
                  <WalletWrapper>
                    <WalletLogo src={otherWallet} />
                    <WalletText theme={theme}>Other</WalletText>
                  </WalletWrapper>
                </Show>
                <Show when={wallet === 'wif'}>
                  <WalletWrapper>
                    <WalletLogo src={wifWallet} />
                    <WalletText theme={theme}>Restore with private key</WalletText>
                  </WalletWrapper>
                </Show>
                <Show when={newWallet && wallet === 'master'}>
                  <WalletWrapper>
                    <YoursWalletContainer theme={theme}>
                      <WalletLogo src={masterWallet} style={{ width: '1.25rem' }} />
                    </YoursWalletContainer>
                    <WalletText theme={theme}>Restore from master backup</WalletText>
                  </WalletWrapper>
                </Show>
              </>
            }
          />
        )
      );
    });
  };

  const selectImportWallet = (
    <>
      <HeaderText theme={theme}>Restore a Wallet</HeaderText>
      <Text theme={theme} style={{ marginBottom: '1rem', width: '90%' }}>
        Select the wallet you'd like to restore from
      </Text>
      {availableWallets(['yours', 'relayx', 'twetch', 'wif', newWallet ? 'master' : undefined, 'other'])}
      <Button
        theme={theme}
        type="secondary"
        label="Go back"
        onClick={() => (newWallet ? navigate('/') : onNavigateBack('manage-accounts'))}
      />
    </>
  );

  const successStep = (
    <>
      <HeaderText theme={theme}>Success!</HeaderText>
      <Text theme={theme} style={{ marginBottom: '1rem' }}>
        Your wallet has been restored.
      </Text>
      <Button
        theme={theme}
        type="primary"
        label="Enter"
        onClick={() => {
          window.location.reload();
        }}
      />
    </>
  );

  return (
    <Show when={!loading} whenFalseContent={<PageLoader theme={theme} message="Restoring..." />}>
      <Content>
        <Show when={newWallet && step !== 1}>
          <YoursIcon width="4rem" />
        </Show>
        <Show when={step === 1}>{selectImportWallet}</Show>
        <Show when={step === 2}>{enterSeedStep}</Show>
        <Show when={step === 3}>{passwordStep}</Show>
        <Show when={step === 4}>{successStep}</Show>
      </Content>
    </Show>
  );
};
