import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBsv } from '../../hooks/useBsv';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useWeb3Context } from '../../hooks/useWeb3Context';
import { TaggedDerivationData } from '../../utils/keys';
import { sleep } from '../../utils/sleep';
import { storage } from '../../utils/storage';

export type OrdTransferRequestProps = {
  web3Request: TaggedDerivationData;
  popupId: number | undefined;
  onResponse: () => void;
};

export const PubKeyFromTagRequest = (props: OrdTransferRequestProps) => {
  const { web3Request, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { retrieveTaggedDerivationPubKey, isProcessing, setIsProcessing } = useBsv();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { isPasswordRequired } = useWeb3Context();

  useEffect(() => {
    if (!successTxId) return;
    if (!message) {
      resetSendState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message]);

  useEffect(() => {
    const onbeforeunloadFn = () => {
      storage.remove('transferOrdinalRequest');
    };

    window.addEventListener('beforeunload', onbeforeunloadFn);
    return () => {
      window.removeEventListener('beforeunload', onbeforeunloadFn);
    };
  }, []);

  const resetSendState = () => {
    setPasswordConfirm('');
    setSuccessTxId('');
    setIsProcessing(false);
  };

  const handleGetKey = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);
    if (!web3Request.label || !web3Request.id) {
      addSnackbar('Invalid or missing tag data', 'info');
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    const res = await retrieveTaggedDerivationPubKey(passwordConfirm, web3Request);

    if (!res.address || !res.pubKey) {
      const message =
        res.error === 'invalid-password'
          ? 'Invalid Password!'
          : res.error === 'no-keys'
            ? 'Could not locate the wallet keys!'
            : 'An unknown error has occurred! Try again.';

      addSnackbar(message, 'error');
      return;
    }

    setSuccessTxId(res.pubKey);
    addSnackbar('Successfully generated key!', 'success');

    chrome.runtime.sendMessage({
      action: 'getPubKeyFromTagResponse',
      address: res.address,
      pubKey: res.pubKey,
    });

    setTimeout(async () => {
      onResponse();
      storage.remove('transferOrdinalRequest');
      if (popupId) chrome.windows.remove(popupId);
    }, 2000);
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Processing request..." />
      </Show>

      <Show when={!isProcessing && !!web3Request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Approve Request</HeaderText>
          <FormContainer noValidate onSubmit={(e) => handleGetKey(e)}>
            <Text theme={theme} style={{ margin: '1rem 0' }}>
              {'The app is requesting to generate a new public key.'}
            </Text>
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                style={{ margin: '0.25rem' }}
              />
            </Show>
            <Button theme={theme} type="primary" label="Approve" disabled={isProcessing} isSubmit />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
