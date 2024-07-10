import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { HeaderText, Text, YoursLogo } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { ColorThemeProps } from '../../theme';
import { sleep } from '../../utils/sleep';
import copyIcon from '../../assets/copy-green.svg';
import yoursLogo from '../../assets/yours-logo.png';
import { useServiceContext } from '../../hooks/useServiceContext';

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

const SeedContainer = styled.div<ColorThemeProps>`
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.darkAccent};
  border-radius: 0.5rem;
  border: 1px solid ${({ theme }) => theme.gray + '50'};
  width: 80%;
  padding: 1rem;
  margin: 0.5rem 0 1rem 0;
`;

const CopyToClipboardContainer = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  margin-top: 1.5rem;
  border: none;
  background: none;
`;

const CopyIcon = styled.img`
  width: 0.85rem;
  height: 0.85rem;
`;

export const CreateWallet = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [step, setStep] = useState(1);
  const [seedWords, setSeedWords] = useState<string[]>([]);

  const { addSnackbar } = useSnackbar();
  const { hideMenu, showMenu } = useBottomMenu();
  const [loading, setLoading] = useState(false);
  const { keysService } = useServiceContext();

  useEffect(() => {
    hideMenu();

    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu]);

  const handleKeyGeneration = async (event: React.FormEvent<HTMLFormElement>) => {
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
    const mnemonic = await keysService.generateSeedAndStoreEncrypted(password);
    setSeedWords(mnemonic.split(' '));

    setLoading(false);
    setStep(2);
  };

  const handleCopyToClipboard = (seed: string) => {
    navigator.clipboard.writeText(seed).then(() => {
      addSnackbar('Copied!', 'success');
    });
  };

  const passwordStep = (
    <>
      <Content>
        <HeaderText theme={theme}>Create password</HeaderText>
        <Text style={{ marginBottom: '1rem' }} theme={theme}>
          This will be used to unlock your wallet.
        </Text>
        <FormContainer onSubmit={handleKeyGeneration}>
          <Input
            theme={theme}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            theme={theme}
            placeholder="Confirm password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          <Text theme={theme} style={{ margin: '1rem 0 1rem' }}>
            Make sure you are in a safe place and no one is watching.
          </Text>
          <Button theme={theme} type="primary" label="Generate Seed" isSubmit />
          <Button theme={theme} type="secondary" label="Go back" onClick={() => navigate('/')} />
        </FormContainer>
      </Content>
    </>
  );

  const copySeedStep = (
    <>
      <Content>
        <HeaderText theme={theme}>Your recovery phrase</HeaderText>
        <Text theme={theme} style={{ marginBottom: '1rem' }}>
          Safely write down and store your seed phrase in a safe place.
        </Text>
        <SeedContainer theme={theme}>
          <Text style={{ textAlign: 'left', width: '100%', margin: '0', color: theme.white }} theme={theme}>
            {seedWords.join(' ').trim()}
          </Text>
          <CopyToClipboardContainer onClick={() => handleCopyToClipboard(seedWords.join(' ').trim())}>
            <CopyIcon src={copyIcon} />
            <Text
              style={{
                color: theme.primaryButton,
                textDecoration: 'underline',
                margin: '0 0 0 0.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
              }}
              theme={theme}
            >
              Copy to clipboard
            </Text>
          </CopyToClipboardContainer>
        </SeedContainer>
        <Button
          theme={theme}
          type="primary"
          label="Next"
          onClick={() => {
            setStep(3);
            setSeedWords([]);
          }}
        />
      </Content>
    </>
  );

  const successStep = (
    <>
      <Content>
        <YoursLogo src={yoursLogo} />
        <HeaderText theme={theme}>Success!</HeaderText>
        <Text theme={theme} style={{ marginBottom: '1rem' }}>
          Your wallet is ready to go.
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
        <PageLoader theme={theme} message="Generating keys..." />
      </Show>
      <Show when={!loading && step === 1}>{passwordStep}</Show>
      <Show when={!loading && step === 2}>{copySeedStep}</Show>
      <Show when={!loading && step === 3}>{successStep}</Show>
    </>
  );
};
