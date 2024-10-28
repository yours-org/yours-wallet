import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { YoursIcon } from '../../components/YoursIcon';
import { HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { sleep } from '../../utils/sleep';
import { useServiceContext } from '../../hooks/useServiceContext';
import { WifKeys } from '../../services/types/keys.types';
import { useNavigate } from 'react-router-dom';
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

export type ImportAccountProps = {
  onNavigateBack: () => void;
  newWallet?: boolean;
};

export const ImportAccount = ({ onNavigateBack, newWallet = false }: ImportAccountProps) => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [step, setStep] = useState(1);
  const [payPk, setPayPk] = useState('');
  const [ordPk, setOrdPk] = useState('');
  const [identityPk, setIdentityPk] = useState('');
  const { addSnackbar } = useSnackbar();
  const { keysService, chromeStorageService } = useServiceContext();
  const { hideMenu, showMenu } = useBottomMenu();
  const [loading, setLoading] = useState(false);
  const [explicitlyDisableButton, setExplicitlyDisableButton] = useState(false);
  const hiddenFileInput = useRef<HTMLInputElement>(null);
  const [accountName, setAccountName] = useState('');
  const [iconURL, setIconURL] = useState('');

  useEffect(() => {
    newWallet && hideMenu();

    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu, newWallet]);

  const handleImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLoading(true);
      if (password.length < 8) {
        setLoading(false);
        addSnackbar(newWallet ? 'The password must be at least 8 characters!' : 'Invalid Password!', 'error');
        return;
      }

      if (newWallet && password !== passwordConfirm) {
        addSnackbar('The passwords do not match!', 'error');
        return;
      }

      if (!payPk || !ordPk) {
        addSnackbar('Both payPk and ordPk WIFs are required!', 'error');
        return;
      }

      if (!identityPk) {
        setLoading(false);
        setExplicitlyDisableButton(true);
        setExplicitlyDisableButton(false);
        setLoading(true);
      }

      // Some artificial delay for the loader
      await sleep(50);
      const keys = await keysService.generateKeysFromWifAndStoreEncrypted(
        password,
        {
          payPk,
          ordPk,
          identityPk,
        },
        newWallet,
      );
      if (!keys) {
        addSnackbar('An error occurred while creating the account! Make sure your password is correct.', 'error');
        return;
      }

      await chromeStorageService.switchAccount(keys.identityAddress || identityPk);
      // Save account name and icon URL to local storage
      await saveAccountDataToChromeStorage(chromeStorageService, accountName, iconURL); // Call the imported function
      setStep(3);
    } catch (error) {
      console.log(error);
      addSnackbar('An error occurred while importing the account!', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonUploadClick = () => {
    hiddenFileInput.current?.click();
  };

  const handleFileRead = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        try {
          const jsonData = JSON.parse(text) as WifKeys;
          if (!jsonData.payPk || !jsonData.ordPk) {
            addSnackbar('Invalid 1Sat Ord Wallet format!', 'error');
            return;
          }
          if (jsonData.mnemonic) {
            addSnackbar(
              'Invalid 1Sat Ord Wallet format. File contains seed phrase. Please use a different restore method using your seed phrase!',
              'error',
              4000,
            );
            return;
          }
          setPayPk(jsonData.payPk ? jsonData.payPk : '');
          setOrdPk(jsonData.ordPk ? jsonData.ordPk : '');
          setIdentityPk(jsonData.identityPk ? jsonData.identityPk : '');
          setStep(2);
        } catch (error) {
          console.error('Error parsing JSON file', error);
          addSnackbar('Error parsing JSON file!', 'error');
          return;
        }
      };
      reader.readAsText(file);
    } else {
      console.error('Unsupported file type. Please upload a JSON file.');
      addSnackbar('Unsupported file type. Please upload a JSON file.', 'error');
    }
  };

  const passwordStep = (
    <>
      <HeaderText theme={theme}>{newWallet ? 'Create password' : 'Import Account'}</HeaderText>
      <Text theme={theme}>
        {newWallet ? 'This will be used to unlock your wallet.' : 'Enter your existing password.'}
      </Text>
      <FormContainer onSubmit={handleImport}>
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
            placeholder="Confirm Password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            style={{ marginBottom: '2rem' }}
          />
        </Show>
        <Button theme={theme} type="primary" label="Finish" disabled={explicitlyDisableButton || loading} isSubmit />
        <Button
          theme={theme}
          type="secondary"
          label="Go back"
          onClick={() => (newWallet ? navigate('/') : onNavigateBack())}
        />
      </FormContainer>
    </>
  );

  const enterWifsStep = (
    <>
      <HeaderText theme={theme}>Import a WIF Wallet</HeaderText>
      <Text theme={theme}>Input assets directly from your WIF private keys or import a 1Sat JSON Wallet.</Text>
      <FormContainer onSubmit={() => setStep(2)}>
        <Input
          theme={theme}
          placeholder="Pay WIF private key"
          type="text"
          value={payPk}
          onChange={(e) => setPayPk(e.target.value)}
          style={{ margin: '0.25rem' }}
        />
        <Input
          theme={theme}
          placeholder="Ord WIF private key"
          type="text"
          value={ordPk}
          onChange={(e) => setOrdPk(e.target.value)}
          style={{ margin: '0.25rem' }}
        />
        <Input
          theme={theme}
          placeholder="Identity WIF private key"
          type="text"
          value={identityPk}
          onChange={(e) => setIdentityPk(e.target.value)}
          style={{ margin: '0.25rem' }}
        />
        <Text theme={theme} style={{ margin: '1rem 0 1rem' }}>
          Make sure you are in a safe place and no one is watching.
        </Text>
        <Button theme={theme} type="primary" label="Next" isSubmit />
      </FormContainer>
      <Button
        theme={theme}
        type="secondary-outline"
        onClick={handleJsonUploadClick}
        label="Upload 1Sat JSON"
        style={{ margin: 0 }}
      />
      <input
        type="file"
        ref={hiddenFileInput}
        onChange={handleFileRead}
        style={{ display: 'none' }}
        accept="application/json"
      />
      <Button
        theme={theme}
        type="secondary"
        label="Go back"
        onClick={() => (newWallet ? navigate('/') : onNavigateBack())}
      />
    </>
  );

  const successStep = (
    <>
      <HeaderText theme={theme}>Success!</HeaderText>
      <Text theme={theme} style={{ marginBottom: '1rem' }}>
        Your wallet has been imported.
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
    <>
      <Show when={!loading} whenFalseContent={<PageLoader theme={theme} message="Importing..." />}>
        <Content>
          <Show when={newWallet}>
            <YoursIcon width="4rem" />
          </Show>
          <Show when={step === 1}>{enterWifsStep}</Show>
          <Show when={step === 2}>{passwordStep}</Show>
          <Show when={step === 3}>{successStep}</Show>
        </Content>
      </Show>
    </>
  );
};
