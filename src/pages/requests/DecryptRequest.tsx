import { useEffect, useState } from 'react';
import { DecryptRequest as DecryptRequestType } from 'yours-wallet-provider';
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
import { decryptUsingPrivKey } from '../../utils/crypto';
import { getPrivateKeyFromTag, Keys } from '../../utils/keys';
import { sleep } from '../../utils/sleep';
import { storage } from '../../utils/storage';

export type DecryptResponse = {
  decryptedMessages: string[];
  error?: string;
};

export type DecryptRequestProps = {
  request: DecryptRequestType;
  popupId: number | undefined;
  onDecrypt: () => void;
};

export const DecryptRequest = (props: DecryptRequestProps) => {
  const { request, onDecrypt, popupId } = props;
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [decryptedMessages, setDecryptedMessages] = useState<string[] | undefined>(undefined);
  const { addSnackbar, message } = useSnackbar();
  const { isPasswordRequired } = useAppStateContext();
  const { retrieveKeys } = useKeys();
  const [hasDecrypted, setHasDecrypted] = useState(false);
  const { isProcessing, setIsProcessing } = useBsv();

  useEffect(() => {
    if (hasDecrypted || isPasswordRequired || !request || !retrieveKeys) return;
    handleDecryption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDecrypted, isPasswordRequired, request, retrieveKeys]);

  useEffect(() => {
    setSelected('bsv');
  }, [setSelected]);

  useEffect(() => {
    if (!decryptedMessages) return;
    if (!message && decryptedMessages) {
      resetSendState();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, decryptedMessages]);

  useEffect(() => {
    const onbeforeunloadFn = () => {
      if (popupId) removeWindow(popupId);
    };

    window.addEventListener('beforeunload', onbeforeunloadFn);
    return () => {
      window.removeEventListener('beforeunload', onbeforeunloadFn);
    };
  }, [popupId]);

  const resetSendState = () => {
    setPasswordConfirm('');
    setIsProcessing(false);
  };

  const handleDecryption = async () => {
    setIsProcessing(true);
    await sleep(25);

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    const keys = (await retrieveKeys(passwordConfirm)) as Keys;
    const PrivKey = getPrivateKeyFromTag(request.tag ?? { label: 'panda', id: 'identity', domain: '' }, keys);

    const decrypted = decryptUsingPrivKey(request.messages, PrivKey);

    if (!decrypted) {
      addSnackbar('Could not decrypt!', 'error');
      setIsProcessing(false);
      return;
    }

    sendMessage({
      action: 'decryptResponse',
      decryptedMessages: decrypted,
    });

    addSnackbar('Successfully Decrypted!', 'success');
    setDecryptedMessages(decrypted);
    setHasDecrypted(true);
    setIsProcessing(false);
    setTimeout(async () => {
      onDecrypt();
      await storage.remove('decryptRequest');
      if (popupId) removeWindow(popupId);
    }, 2000);
  };

  const clearRequest = async () => {
    await storage.remove('decryptRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Decrypting Messages..." />
      </Show>
      <Show when={!isProcessing && !!request && !hasDecrypted}>
        <ConfirmContent>
          <BackButton onClick={clearRequest} />
          <HeaderText theme={theme}>Decrypt Messages</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            {'The app is requesting to decrypt messages using your private key:'}
          </Text>
          <FormContainer
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              handleDecryption();
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
            <Button theme={theme} type="primary" label="Decrypt Message" disabled={isProcessing} isSubmit />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
