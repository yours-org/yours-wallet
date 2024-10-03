import { useEffect, useState } from 'react';
import { DecryptRequest as DecryptRequestType } from 'yours-wallet-provider';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useServiceContext } from '../../hooks/useServiceContext';
import { removeWindow, sendMessage } from '../../utils/chromeHelpers';
import { decryptUsingPrivKey } from '../../utils/crypto';
import { getPrivateKeyFromTag, Keys } from '../../utils/keys';
import { sleep } from '../../utils/sleep';

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
  const { handleSelect, hideMenu } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [decryptedMessages, setDecryptedMessages] = useState<string[] | undefined>(undefined);
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, keysService } = useServiceContext();
  const [hasDecrypted, setHasDecrypted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const isPasswordRequired = chromeStorageService.isPasswordRequired();

  useEffect(() => {
    if (hasDecrypted || isPasswordRequired || !request) return;
    handleDecryption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDecrypted, isPasswordRequired, request]);

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  useEffect(() => {
    if (!decryptedMessages) return;
    if (!message && decryptedMessages) {
      resetSendState();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, decryptedMessages]);

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

    const keys = (await keysService.retrieveKeys(passwordConfirm)) as Keys;
    const PrivKey = getPrivateKeyFromTag(request.tag ?? { label: 'yours', id: 'identity', domain: '' }, keys);

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
    await sleep(2000);
    setDecryptedMessages(decrypted);
    setHasDecrypted(true);
    setIsProcessing(false);
    onDecrypt();
  };

  const clearRequest = async () => {
    await chromeStorageService.remove('decryptRequest');
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
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
