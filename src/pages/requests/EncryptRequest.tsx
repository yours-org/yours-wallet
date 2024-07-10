import { PublicKey } from 'bsv-wasm-web';
import { useEffect, useState } from 'react';
import { EncryptRequest as EncryptRequestType } from 'yours-wallet-provider';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useBsv } from '../../hooks/useBsv';
import { useKeys } from '../../hooks/useKeys';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useAppStateContext } from '../../hooks/useAppStateContext';
import { removeWindow, sendMessage } from '../../utils/chromeHelpers';
import { encryptUsingPrivKey } from '../../utils/crypto';
import { getPrivateKeyFromTag, Keys } from '../../utils/keys';
import { sleep } from '../../utils/sleep';
import { storage } from '../../utils/storage';

export type EncryptResponse = {
  encryptedMessages: string[];
  error?: string;
};

export type EncryptRequestProps = {
  request: EncryptRequestType;
  popupId: number | undefined;
  onEncrypt: () => void;
};

export const EncryptRequest = (props: EncryptRequestProps) => {
  const { request, onEncrypt, popupId } = props;
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [encryptedMessages, setEncryptedMessages] = useState<string[] | undefined>(undefined);
  const { addSnackbar, message } = useSnackbar();
  const { isPasswordRequired } = useAppStateContext();
  const { retrieveKeys } = useKeys();
  const [hasEncrypted, setHasEncrypted] = useState(false);

  const { isProcessing, setIsProcessing } = useBsv();

  useEffect(() => {
    if (hasEncrypted || isPasswordRequired || !request || !retrieveKeys) return;
    handleEncryption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEncrypted, isPasswordRequired, request, retrieveKeys]);

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

    const PrivKey = getPrivateKeyFromTag(request.tag ?? { label: 'panda', id: 'identity', domain: '' }, keys);

    const encrypted = encryptUsingPrivKey(
      request.message,
      request.encoding,
      request.pubKeys.map((key) => PublicKey.from_hex(key)),
      PrivKey,
    );

    if (!encrypted) {
      addSnackbar('Could not encrypt!', 'error');
      setIsProcessing(false);
      return;
    }

    sendMessage({
      action: 'encryptResponse',
      encryptedMessages: encrypted,
    });

    addSnackbar('Successfully Encrypted!', 'success');
    setEncryptedMessages(encrypted);
    setHasEncrypted(true);
    setIsProcessing(false);
    onEncrypt();
  };

  const clearRequest = async () => {
    await storage.remove('encryptRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Encrypting Message..." />
      </Show>
      <Show when={!isProcessing && !!request && !hasEncrypted}>
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
