import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import relayXLogo from '../../assets/relayx.svg';
import twetchLogo from '../../assets/twetch.svg';
import pandaLogo from '../../assets/panda.svg';
import yoursWhiteLogo from '../../assets/yours-white-logo.svg';
import yoursLogo from '../../assets/yours-logo.png';
import otherWallet from '../../assets/other-wallet.svg';
import wifWallet from '../../assets/wif-wallet.svg';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { HeaderText, Text, YoursLogo } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { WalletRow } from '../../components/WalletRow';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { SupportedWalletImports, useKeys } from '../../hooks/useKeys';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { ColorThemeProps } from '../../theme';
import { sleep } from '../../utils/sleep';

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

const SeedInput = styled.textarea<ColorThemeProps & { $isExpert: boolean }>`
  background-color: ${({ theme }) => theme.darkAccent};
  border-radius: 0.5rem;
  border: 1px solid ${({ theme }) => theme.gray + '50'};
  width: 80%;
  height: 4rem;
  font-size: 0.85rem;
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  padding: 1rem;
  margin: 0.5rem;
  outline: none;
  color: ${({ theme }) => theme.white + '80'};
  resize: none;

  &::placeholder {
    color: ${({ theme }) => theme.white + '80'};
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
  background-color: ${({ theme }) => theme.black};
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
  color: ${({ theme }) => theme.white};
  font-weight: 600;
`;

export const RestoreWallet = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [step, setStep] = useState(1);
  const [seedWords, setSeedWords] = useState<string>('');
  const { addSnackbar } = useSnackbar();
  const { generateSeedAndStoreEncrypted } = useKeys();
  const { hideMenu, showMenu } = useBottomMenu();
  const [loading, setLoading] = useState(false);
  const [isExpertImport, setIsExpertImport] = useState(false);
  const [importWallet, setImportWallet] = useState<SupportedWalletImports | undefined>();
  const [walletDerivation, setWalletDerivation] = useState<string | null>(null);
  const [ordDerivation, setOrdDerivation] = useState<string | null>(null);
  const [identityDerivation, setIdentityDerivation] = useState<string | null>(null);
  useEffect(() => {
    hideMenu();

    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu]);

  const handleExpertToggle = () => setIsExpertImport(!isExpertImport);

  const handleRestore = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    if (password.length < 8) {
      setLoading(false);
      addSnackbar('The password must be at least 8 characters!', 'error');
      return;
    }

    if (password !== passwordConfirm) {
      setLoading(false);
      addSnackbar('The passwords do not match!', 'error');
      return;
    }

    // Some artificial delay for the loader
    await sleep(50);
    const mnemonic = generateSeedAndStoreEncrypted(
      password,
      seedWords,
      walletDerivation,
      ordDerivation,
      identityDerivation,
      importWallet,
    );
    if (!mnemonic) {
      addSnackbar('An error occurred while restoring the wallet!', 'error');
      return;
    }

    setLoading(false);
    setStep(4);
  };

  const handleWalletSelection = (wallet?: SupportedWalletImports) => {
    setImportWallet(wallet);
    if (wallet === 'wif') {
      navigate('/import-wallet');
      return;
    }
    setStep(2);
  };

  const getRestoreTitle = () => {
    return importWallet === 'yours'
      ? 'Restore Yours wallet'
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
      <Content>
        <HeaderText theme={theme}>Create a password</HeaderText>
        <Text theme={theme}>This is used to unlock your wallet.</Text>
        <FormContainer onSubmit={handleRestore}>
          <Input
            theme={theme}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            theme={theme}
            placeholder="Confirm Password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            style={{ marginBottom: '2rem' }}
          />
          <Button theme={theme} type="primary" label="Finish" isSubmit />
          <Button theme={theme} type="secondary" label="Go back" onClick={() => setStep(2)} />
        </FormContainer>
      </Content>
    </>
  );

  const enterSeedStep = (
    <>
      <Content>
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
          <Show when={!importWallet}>
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
      </Content>
    </>
  );

  const availableWallets = (wallets: (SupportedWalletImports | undefined)[]) => {
    return wallets.map((wallet) => {
      return (
        <WalletRow
          key={window.crypto.randomUUID()}
          onClick={() => handleWalletSelection(wallet)}
          element={
            <>
              <Show when={wallet === 'yours'}>
                <WalletWrapper>
                  <YoursWalletContainer theme={theme}>
                    <WalletLogo src={yoursWhiteLogo} style={{ width: '1.25rem' }} />
                  </YoursWalletContainer>
                  <WalletText theme={theme}>Yours</WalletText>
                </WalletWrapper>
              </Show>
              <Show when={wallet === 'panda'}>
                <WalletWrapper>
                  <YoursWalletContainer theme={theme}>
                    <WalletLogo src={pandaLogo} style={{ width: '1.25rem', margin: '0.25rem 0 0 0.1rem' }} />
                  </YoursWalletContainer>
                  <WalletText theme={theme}>Panda</WalletText>
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
              <Show when={!wallet}>
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
            </>
          }
        />
      );
    });
  };

  const selectImportWallet = (
    <>
      <BackButton onClick={() => navigate('/')} />
      <Content>
        <HeaderText theme={theme}>Restore a Wallet</HeaderText>
        <Text theme={theme} style={{ marginBottom: '1rem', width: '90%' }}>
          Select the wallet you'd like to restore from
        </Text>
        {availableWallets(['yours', 'panda', 'relayx', 'twetch', undefined, 'wif'])}
      </Content>
    </>
  );

  const successStep = (
    <>
      <Content>
        <YoursLogo src={yoursLogo} />
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
      </Content>
    </>
  );

  return (
    <>
      <Show when={loading}>
        <PageLoader theme={theme} message="Restoring Wallet..." />
      </Show>
      <Show when={!loading && step === 1}>{selectImportWallet}</Show>
      <Show when={!loading && step === 2}>{enterSeedStep}</Show>
      <Show when={!loading && step === 3}>{passwordStep}</Show>
      <Show when={!loading && step === 4}>{successStep}</Show>
    </>
  );
};
