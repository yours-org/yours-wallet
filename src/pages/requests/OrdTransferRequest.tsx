import validate from 'bitcoin-address-validation';
import { useEffect, useState } from 'react';
import { TransferOrdinal } from 'yours-wallet-provider';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Ordinal } from '../../components/Ordinal';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useOrds } from '../../hooks/useOrds';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useAppStateContext } from '../../hooks/useAppStateContext';
import { removeWindow, sendMessage } from '../../utils/chromeHelpers';
import { truncate } from '../../utils/format';
import { sleep } from '../../utils/sleep';
import { storage } from '../../utils/storage';

export type OrdTransferRequestProps = {
  request: TransferOrdinal;
  popupId: number | undefined;
  onResponse: () => void;
};

export const OrdTransferRequest = (props: OrdTransferRequestProps) => {
  const { request, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { ordAddress, getOrdinals, isProcessing, transferOrdinal, setIsProcessing, getOrdinalsBaseUrl, ordinals } =
    useOrds();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { isPasswordRequired } = useAppStateContext();

  useEffect(() => {
    if (!successTxId) return;
    if (!message && ordAddress) {
      resetSendState();
      getOrdinals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message, getOrdinals, ordAddress]);

  const resetSendState = () => {
    setPasswordConfirm('');
    setSuccessTxId('');
    setIsProcessing(false);
  };

  const handleTransferOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);
    if (!validate(request.address)) {
      addSnackbar('Invalid address detected!', 'info');
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    const transferRes = await transferOrdinal(request.address, request.outpoint, passwordConfirm);

    if (!transferRes.txid || transferRes.error) {
      const message =
        transferRes.error === 'invalid-password'
          ? 'Invalid Password!'
          : transferRes.error === 'insufficient-funds'
            ? 'Insufficient Funds!'
            : transferRes.error === 'no-ord-utxo'
              ? 'Could not locate the ordinal!'
              : 'An unknown error has occurred! Try again.';

      addSnackbar(message, 'error');
      return;
    }

    setSuccessTxId(transferRes.txid);
    addSnackbar('Transfer Successful!', 'success');

    sendMessage({
      action: 'transferOrdinalResponse',
      txid: transferRes.txid,
    });
    onResponse();
  };

  const clearRequest = async () => {
    await storage.remove('transferOrdinalRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Processing request..." />
      </Show>

      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <BackButton onClick={clearRequest} />
          <HeaderText theme={theme}>Approve Request</HeaderText>
          <Ordinal
            inscription={ordinals.data.filter((ord) => ord.outpoint.toString() === request.outpoint)[0]}
            theme={theme}
            url={`${getOrdinalsBaseUrl()}/content/${request.origin}`}
            selected={true}
          />
          <FormContainer noValidate onSubmit={(e) => handleTransferOrdinal(e)}>
            <Text theme={theme} style={{ margin: '1rem 0' }}>
              {`Transfer to: ${truncate(request.address, 5, 5)}`}
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
            <Text theme={theme} style={{ margin: '0.5rem 0' }}>
              Double check details before sending.
            </Text>
            <Button theme={theme} type="primary" label="Approve" disabled={isProcessing} isSubmit />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
