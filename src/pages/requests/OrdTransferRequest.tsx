import validate from 'bitcoin-address-validation';
import { useEffect, useState } from 'react';
import { TransferOrdinal } from 'yours-wallet-provider';
import type { Txo } from '@1sat/wallet-toolbox';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Ordinal } from '../../components/Ordinal';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useServiceContext } from '../../hooks/useServiceContext';
import { removeWindow, sendMessage } from '../../utils/chromeHelpers';
import { truncate } from '../../utils/format';
import { sleep } from '../../utils/sleep';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { getErrorMessage } from '../../utils/tools';

export type OrdTransferRequestProps = {
  request: TransferOrdinal;
  popupId: number | undefined;
  onResponse: () => void;
};

export const OrdTransferRequest = (props: OrdTransferRequestProps) => {
  const { request, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { hideMenu } = useBottomMenu();
  const [isProcessing, setIsProcessing] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, ordinalService, wallet } = useServiceContext();
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const baseUrl = wallet.services.baseUrl;
  const [txo, setTxo] = useState<Txo | undefined>();

  useEffect(() => {
    hideMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!request?.outpoint) return;
    wallet.loadTxo(request.outpoint).then((result) => {
      setTxo(result);
    });
  }, [wallet, request.outpoint]);

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

    const transferRes = await ordinalService.transferOrdinal(request.address, request.outpoint, passwordConfirm);

    if (!transferRes.txid || transferRes.error) {
      addSnackbar(getErrorMessage(transferRes.error), 'error');
      setIsProcessing(false);
      return;
    }

    addSnackbar('Transfer Successful!', 'success');
    await sleep(2000);

    sendMessage({
      action: 'transferOrdinalResponse',
      txid: transferRes.txid,
    });
    onResponse();
  };

  const clearRequest = async () => {
    sendMessage({
      action: 'transferOrdinalResponse',
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('transferOrdinalRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  // Extract origin outpoint for content URL
  const originData = txo?.data?.origin?.data as { outpoint?: string } | undefined;
  const originOutpoint = originData?.outpoint || request.origin;

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Processing request..." />
      </Show>

      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Approve Request</HeaderText>
          {txo && <Ordinal txo={txo} theme={theme} url={`${baseUrl}/content/${originOutpoint}`} selected={true} />}
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
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
