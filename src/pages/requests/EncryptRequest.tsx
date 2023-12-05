import { PublicKey } from 'bsv-wasm-web';
import { useEffect, useState } from 'react';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useBsv, Web3EncryptRequest } from '../../hooks/useBsv';
import { useKeys } from '../../hooks/useKeys';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useWeb3Context } from '../../hooks/useWeb3Context';
import { encryptUsingPrivKey } from '../../utils/crypto';
import { getPrivateKeyFromTag, Keys } from '../../utils/keys';
import { sleep } from '../../utils/sleep';
import { storage } from '../../utils/storage';

export type EncryptResponse = {
  encryptedMessages: string[];
  error?: string;
};

export type EncryptRequestProps = {
  messageToEncrypt: Web3EncryptRequest;
  popupId: number | undefined;
  onEncrypt: () => void;
};

export const EncryptRequest = (props: EncryptRequestProps) => {
  const { messageToEncrypt, onEncrypt, popupId } = props;
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [encryptedMessages, setEncryptedMessages] = useState<string[] | undefined>(undefined);
  const { addSnackbar, message } = useSnackbar();
  const { isPasswordRequired } = useWeb3Context();
  const { retrieveKeys } = useKeys();
  const [hasEncrypted, setHasEncrypted] = useState(false);

  const { isProcessing, setIsProcessing } = useBsv();

  useEffect(() => {
    if (hasEncrypted || isPasswordRequired || !messageToEncrypt || !retrieveKeys) return;
    handleEncryption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEncrypted, isPasswordRequired, messageToEncrypt, retrieveKeys]);

  useEffect(() => {
    setSelected('bsv');
  }, [setSelected]);

  useEffect(() => {
    if (!encryptedMessages) return;
    if (!message && encryptedMessages) {
      resetSendState();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, encryptedMessages]);

  useEffect(() => {
    const onbeforeunloadFn = () => {
      storage.remove('encryptRequest');
    };

    window.addEventListener('beforeunload', onbeforeunloadFn);
    return () => {
      window.removeEventListener('beforeunload', onbeforeunloadFn);
    };
  }, []);

  const resetSendState = () => {
    setPasswordConfirm('');
    setIsProcessing(false);
  };

  const handleEncryption = async () => {
    setIsProcessing(true);
    await sleep(25);

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    const keys = (await retrieveKeys(passwordConfirm)) as Keys;

    const PrivKey = getPrivateKeyFromTag(messageToEncrypt.tag ?? { label: 'panda', id: 'identity', domain: '' }, keys);

    const encrypted = encryptUsingPrivKey(
      messageToEncrypt.message,
      messageToEncrypt.encoding,
      messageToEncrypt.pubKeys.map((key) => PublicKey.from_hex(key)),
      PrivKey,
    );

    if (!encrypted) {
      addSnackbar('Could not encrypt!', 'error');
      setIsProcessing(false);
      return;
    }

    chrome.runtime.sendMessage({
      action: 'encryptResponse',
      encryptedMessages: encrypted,
    });

    addSnackbar('Successfully Encrypted!', 'success');
    setEncryptedMessages(encrypted);
    setHasEncrypted(true);
    setIsProcessing(false);
    setTimeout(() => {
      onEncrypt();
      storage.remove('encryptRequest');
      if (popupId) chrome.windows.remove(popupId);
    }, 2000);
  };

  const clearRequest = () => {
    storage.remove('encryptRequest');
    if (popupId) chrome.windows.remove(popupId);
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Encrypting Message..." />
      </Show>
      <Show when={!isProcessing && !!messageToEncrypt && !hasEncrypted}>
        <ConfirmContent>
          <BackButton onClick={clearRequest} />
          <HeaderText theme={theme}>Encrypt Message</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            {'The app is requesting to encrypt a message using your private key:'}
          </Text>
          <FormContainer
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              handleEncryption();
            }}
          >
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Enter Wallet Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Button theme={theme} type="primary" label="Encrypt Message" disabled={isProcessing} isSubmit />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
