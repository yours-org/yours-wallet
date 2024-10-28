import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { WhiteLabelTheme } from '../../theme.types';
import { sleep } from '../../utils/sleep';
import { useServiceContext } from '../../hooks/useServiceContext';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { NetWork } from 'yours-wallet-provider';
import { useNavigate } from 'react-router-dom';
import { YoursIcon } from '../../components/YoursIcon';
import { FaCopy } from 'react-icons/fa';
import { saveAccountDataToChromeStorage } from '../../utils/chromeStorageHelpers';

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

const SeedContainer = styled.div<WhiteLabelTheme>`
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.color.global.row};
  border-radius: 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.global.gray + '50'};
  width: 80%;
  padding: 1rem;
  margin: 0.5rem 0 1rem 0;
`;

const CopyToClipboardContainer = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  margin-top: 1.5rem;
  border: none;
  background: none;
  width: fit-content;
  cursor: pointer;
`;

const NetworkSelectWrapper = styled.div`
  display: flex;
  align-items: center;
  width: 87%;
  margin: 0.5rem 0 3rem 0;
`;

export type CreateAccountProps = {
  onNavigateBack: () => void;
  newWallet?: boolean;
};

export const CreateAccount = ({ onNavigateBack, newWallet = false }: CreateAccountProps) => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { addSnackbar } = useSnackbar();
  const [network, setNetwork] = useState<NetWork>(NetWork.Mainnet);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [step, setStep] = useState(1);
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [identityAddress, setIdentityAddress] = useState('');
  const { hideMenu, showMenu } = useBottomMenu();
  const [loading, setLoading] = useState(false);
  const { keysService, chromeStorageService } = useServiceContext();
  const [accountName, setAccountName] = useState('');
  const [iconURL, setIconURL] = useState('');

  useEffect(() => {
    newWallet && hideMenu();

    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu, newWallet]);

  const handleKeyGeneration = async (event?: React.FormEvent<HTMLFormElement>) => {
    try {
      event && event.preventDefault();
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

      const keys = await keysService.generateSeedAndStoreEncrypted(password, newWallet, network);

      if (!keys?.mnemonic) {
        addSnackbar('An error occurred while creating the wallet!', 'error');
        return;
      }
      setSeedWords(keys.mnemonic.split(' '));

      if (!keys.identityAddress) {
        addSnackbar('An error occurred while getting the identity address!', 'error');
        return;
      }
      setIdentityAddress(keys.identityAddress);
      // Save account name and icon URL to local storage
      await saveAccountDataToChromeStorage(chromeStorageService, accountName, iconURL);
      setStep(2);
    } catch (error) {
      console.log(error);
      addSnackbar('An error occurred while creating the account! Make sure your password is correct.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = (seed: string) => {
    navigator.clipboard.writeText(seed).then(() => {
      addSnackbar('Copied!', 'success');
    });
  };

  const passwordStep = (
    <>
      <HeaderText theme={theme}>{newWallet ? 'Create password' : 'New Account'}</HeaderText>
      <Text style={{ marginBottom: '1rem' }} theme={theme}>
        {newWallet ? 'This will be used to unlock your wallet.' : 'Enter your existing password.'}
      </Text>
      <FormContainer onSubmit={handleKeyGeneration}>
        <Input
          theme={theme}
          placeholder="Account Name"
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
        />
        <Input
          theme={theme}
          placeholder="Icon URL"
          type="text"
          value={iconURL}
          onChange={(e) => setIconURL(e.target.value)}
        />
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
            placeholder="Confirm password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
        </Show>
        <NetworkSelectWrapper>
          <ToggleSwitch
            theme={theme}
            on={network === NetWork.Testnet}
            onChange={() => setNetwork(network === NetWork.Mainnet ? NetWork.Testnet : NetWork.Mainnet)}
          />
          <Text theme={theme} style={{ margin: '0 0 0 0.5rem', textAlign: 'left' }}>
            {network === NetWork.Testnet ? 'Turn off for mainnet account' : 'Turn on for testnet account'}
          </Text>
        </NetworkSelectWrapper>
        <Button
          theme={theme}
          type="primary"
          label={newWallet ? 'Generate Seed' : 'Create New Account'}
          disabled={loading}
          isSubmit
        />
        <Button
          theme={theme}
          type="secondary"
          label="Go back"
          onClick={() => (newWallet ? navigate('/') : onNavigateBack())}
        />
      </FormContainer>
    </>
  );

  const copySeedStep = (
    <>
      <HeaderText theme={theme}>Your recovery phrase</HeaderText>
      <Text theme={theme} style={{ marginBottom: '1rem' }}>
        Safely write down and store your seed phrase in a safe place.
      </Text>
      <SeedContainer theme={theme}>
        <Text
          style={{
            textAlign: 'left',
            width: '100%',
            margin: '0',
            color: theme.color.global.contrast,
          }}
          theme={theme}
        >
          {seedWords.join(' ').trim()}
        </Text>
        <CopyToClipboardContainer onClick={() => handleCopyToClipboard(seedWords.join(' ').trim())}>
          <FaCopy size={'0.85rem'} color={theme.color.component.primaryButtonRightGradient} />
          <Text
            style={{
              color: theme.color.component.primaryButtonRightGradient,
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
        onClick={async () => {
          setSeedWords([]);
          await chromeStorageService.switchAccount(identityAddress);
          setStep(3);
        }}
      />
    </>
  );

  const successStep = (
    <>
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
    </>
  );

  return (
    <Show when={!loading} whenFalseContent={<PageLoader theme={theme} message="Generating keys..." />}>
      <Content>
        <Show when={newWallet}>
          <YoursIcon width="4rem" />
        </Show>
        <Show when={step === 1}>{passwordStep}</Show>
        <Show when={step === 2}>{copySeedStep}</Show>
        <Show when={step === 3}>{successStep}</Show>
      </Content>
    </Show>
  );
};
