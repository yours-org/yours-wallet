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

const SeedContainer = styled.div`
  display: flex;
  justify-content: space-between;
  width: 75%;
  margin: 0.5rem 0 2rem 0;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
`;

const SeedPill = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  background-color: ${({ theme }) => theme.darkAccent};
  padding: 0.1rem 0 0.1rem 1rem;
  border-radius: 1rem;
  color: ${({ theme }) => theme.white};
  font-size: 0.85rem;
  margin: 0.25rem;
  width: 6rem;
`;

export const CreateWallet = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [step, setStep] = useState(1);
  const [seedWords, setSeedWords] = useState<string[]>([]);

  const { addSnackbar } = useSnackbar();
  const { generateSeedAndStoreEncrypted } = useKeys();
  const { hideMenu, showMenu } = useBottomMenu();
  const [loading, setLoading] = useState(false);

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
    const mnemonic = generateSeedAndStoreEncrypted(password);
    setSeedWords(mnemonic.split(' '));

    setLoading(false);
    setStep(2);
  };

  const passwordStep = (
    <>
      <BackButton onClick={() => navigate('/')} />
      <Content>
        <HeaderText theme={theme}>Create a password</HeaderText>
        <Text theme={theme}>This is used to unlock your wallet.</Text>
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
            placeholder="Confirm Password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          <Text theme={theme} style={{ margin: '3rem 0 1rem' }}>
            Make sure you are in a safe place and no one is watching.
          </Text>
          <Button theme={theme} type="primary" label="Generate Seed" isSubmit />
        </FormContainer>
      </Content>
    </>
  );

  const copySeedStep = (
    <>
      <BackButton onClick={() => setStep(1)} />
      <Content>
        <HeaderText theme={theme}>Your recovery phrase</HeaderText>
        <Text theme={theme} style={{ marginBottom: '1rem' }}>
          Safely write down and store your seed phrase in a safe place.
        </Text>
        <SeedContainer>
          <Column>
            {seedWords.slice(0, 6).map((word, index) => (
              <SeedPill theme={theme} key={index}>
                {index + 1}. {word}
              </SeedPill>
            ))}
          </Column>
          <Column>
            {seedWords.slice(6).map((word, index) => (
              <SeedPill theme={theme} key={index + 6}>
                {index + 7}. {word}
              </SeedPill>
            ))}
          </Column>
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
        <PandaHead />
        <HeaderText theme={theme}>Success!</HeaderText>
        <Text theme={theme} style={{ marginBottom: '1rem' }}>
          Panda Wallet is ready to go.
        </Text>
        <Button theme={theme} type="primary" label="Enter" onClick={() => navigate('/bsv-wallet')} />
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
