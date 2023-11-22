import React, { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { Web3BroadcastRequest, useBsv } from '../../hooks/useBsv';
import { useGorillaPool } from '../../hooks/useGorillaPool';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { sleep } from '../../utils/sleep';
import { storage } from '../../utils/storage';

export type BroadcastResponse = {
  txid: string;
};

export type BroadcastRequestProps = {
  request: Web3BroadcastRequest;
  popupId: number | undefined;
  onBroadcast: () => void;
};

export const BroadcastRequest = (props: BroadcastRequestProps) => {
  const { request, onBroadcast, popupId } = props;
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [txid, setTxid] = useState('');
  const { addSnackbar, message } = useSnackbar();

  const { broadcastWithGorillaPool } = useGorillaPool();
  const { isProcessing, setIsProcessing, updateBsvBalance, fundRawTx } = useBsv();

  useEffect(() => {
    setSelected('bsv');
  }, [setSelected]);

  useEffect(() => {
    if (!txid) return;
    if (!message && txid) {
      resetSendState();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, txid]);

  useEffect(() => {
    const onbeforeunloadFn = () => {
      storage.remove('broadcastRequest');
    };

    window.addEventListener('beforeunload', onbeforeunloadFn);
    return () => {
      window.removeEventListener('beforeunload', onbeforeunloadFn);
    };
  }, []);

  const resetSendState = () => {
    setTxid('');
    setIsProcessing(false);
  };

  const handleBroadcast = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    let rawtx = request.rawtx;
    if (request.fund) {
      rawtx = await fundRawTx(rawtx);
    }
    const { txid, message } = await broadcastWithGorillaPool(rawtx);
    if (!txid) {
      addSnackbar('Error broadcasting the raw tx!', 'error');
      setIsProcessing(false);

      chrome.runtime.sendMessage({
        action: 'broadcastResponse',
        error: message ?? 'Unknown error',
      });

      setTimeout(() => {
        onBroadcast();
        if (popupId) chrome.windows.remove(popupId);
      }, 2000);
      return;
    }
    setTxid(txid);
    chrome.runtime.sendMessage({
      action: 'broadcastResponse',
      txid,
    });

    setIsProcessing(false);
    addSnackbar('Successfully broadcasted the tx!', 'success');

    storage.remove('broadcastRequest');
    setTimeout(async () => {
      await updateBsvBalance(true).catch(() => {});
      onBroadcast();
      if (popupId) chrome.windows.remove(popupId);
    }, 2000);
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Broadcasting transaction..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Broadcast Raw Tx</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            The app is requesting to broadcast a transaction.
          </Text>
          <FormContainer noValidate onSubmit={(e) => handleBroadcast(e)}>
            <Button theme={theme} type="primary" label="Broadcast Now" disabled={isProcessing} isSubmit />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
