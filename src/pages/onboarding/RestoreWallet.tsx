import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import aymLogo from '../../assets/aym-logo.png';
import relayXLogo from '../../assets/relayx-logo.png';
import twetchLogo from '../../assets/twetch-logo.png';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { PandaHead } from '../../components/PandaHead';
import { HeaderText, Text } from '../../components/Reusable';
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
  border-radius: 0.25rem;
  border: 1px solid ${({ theme }) => theme.white + '50'};
  width: 80%;
  height: ${(props) => (props.$isExpert ? '4rem' : '6rem')};
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

const WalletText = styled(Text)<ColorThemeProps>`
  color: ${({ theme }) => theme.white};
  margin: 0;
  font-weight: 700;
  font-size: 1.1rem;
  text-align: center;
`;

const WalletLogo = styled.img`
  width: auto;
  height: 1.5rem;
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
    setStep(2);
  };

  const getRestoreTitle = () => {
    return importWallet === 'relayx'
      ? 'Restore Relay Wallet'
      : importWallet === 'twetch'
      ? 'Restore Twetch Wallet'
      : importWallet === 'aym'
      ? 'Restore Aym Wallet'
      : 'Restore a Wallet';
  };

  const getRestoreDescription = () => {
    return importWallet
      ? 'Enter your seed phrase'
      : 'Enter a seed phrase and use custom derivation paths to import a wallet from anywhere!';
  };

  const passwordStep = (
    <>
      <BackButton onClick={() => navigate('/')} />
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
        </FormContainer>
      </Content>
    </>
  );

  const enterSeedStep = (
    <>
      <BackButton onClick={() => setStep(1)} />
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
          <Text theme={theme} style={{ margin: '3rem 0 1rem' }}>
            Make sure you are in a safe place and no one is watching.
          </Text>
          <Button theme={theme} type="primary" label="Next" isSubmit />
        </FormContainer>
      </Content>
    </>
  );

  const availableWallets = (wallets: (SupportedWalletImports | undefined)[]) => {
    return wallets.map((wallet) => {
      return (
        <WalletRow
          onClick={() => handleWalletSelection(wallet)}
          element={
            <>
              <Show when={wallet === 'relayx'}>
                <WalletLogo src={relayXLogo} />
              </Show>
              <Show when={wallet === 'twetch'}>
                <WalletLogo src={twetchLogo} />
              </Show>
              <Show when={wallet === 'aym'}>
                <WalletLogo src={aymLogo} style={{ height: '2rem' }} />
              </Show>
              <Show when={!wallet}>
                <WalletText theme={theme}>Other Wallet</WalletText>
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
        <HeaderText theme={theme}>Restore from Wallet</HeaderText>
        <Text theme={theme} style={{ marginBottom: '1rem', width: '90%' }}>
          Select from a wallet you'd like to restore from.
        </Text>
        {availableWallets(['relayx', 'twetch', 'aym', undefined])}
      </Content>
    </>
  );

  const successStep = (
    <>
      <Content>
        <PandaHead />
        <HeaderText theme={theme}>Success!</HeaderText>
        <Text theme={theme} style={{ marginBottom: '1rem' }}>
          Your Panda Wallet has been restored.
        </Text>
        <Button theme={theme} type="primary" label="Enter" onClick={() => navigate('/bsv-wallet')} />
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
