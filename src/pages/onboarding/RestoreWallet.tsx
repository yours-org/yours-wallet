import styled from 'styled-components';
import { ColorThemeProps } from '../../theme';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSnackbar } from '../../hooks/useSnackbar';
import { BackButton } from '../../components/BackButton';
import { Text, HeaderText } from '../../components/Reusable';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { PandaHead } from '../../components/PandaHead';
import { useKeys } from '../../hooks/useKeys';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { PageLoader } from '../../components/PageLoader';
import { Show } from '../../components/Show';
import { sleep } from '../../utils/sleep';
import { useTheme } from '../../hooks/useTheme';
import { ToggleSwitch } from '../../components/ToggleSwitch';

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
  const [walletDerivation, setWalletDerivation] = useState<string | null>(null);
  const [ordDerivation, setOrdDerivation] = useState<string | null>(null);
  const [lockingDerivation, setLockingDerivation] = useState<string | null>(null);

  useEffect(() => {
    hideMenu();

    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu]);

  const handleExpertToggle = () => {
    setIsExpertImport(!isExpertImport);
  };

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
      lockingDerivation,
    );
    if (!mnemonic) {
      addSnackbar('An error occurred while restoring the wallet!', 'error');
      return;
    }

    setLoading(false);
    setStep(3);
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
      <BackButton onClick={() => navigate('/')} />
      <Content>
        <HeaderText theme={theme}>Restore a wallet</HeaderText>
        <Text theme={theme} style={{ marginBottom: '1rem', width: '90%' }}>
          Enter a seed phrase and use custom derivation paths to import a wallet from anywhere!
        </Text>
        <FormContainer onSubmit={() => setStep(2)}>
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
              placeholder="Locking Derivation ex. m/0'/236'/0'/0/0"
              type="text"
              value={lockingDerivation ?? ''}
              onChange={(e) => setLockingDerivation(e.target.value)}
              style={{ margin: '0.1rem 0 1rem', width: '85%' }}
            />
          </Show>
          <ExpertImportWrapper>
            <ToggleSwitch theme={theme} on={isExpertImport} onChange={handleExpertToggle} />
            <Text theme={theme} style={{ margin: '0 0 0 0.5rem', textAlign: 'left' }}>
              Use custom derivation paths for wallets like RelayX, SimplyCash, etc
            </Text>
          </ExpertImportWrapper>
          <Text theme={theme} style={{ margin: '3rem 0 1rem' }}>
            Make sure you are in a safe place and no one is watching.
          </Text>
          <Button theme={theme} type="primary" label="Next" isSubmit />
        </FormContainer>
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
      <Show when={!loading && step === 1}>{enterSeedStep}</Show>
      <Show when={!loading && step === 2}>{passwordStep}</Show>
      <Show when={!loading && step === 3}>{successStep}</Show>
    </>
  );
};
