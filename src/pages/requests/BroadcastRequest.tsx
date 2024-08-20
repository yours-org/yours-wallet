import React, { useEffect, useState } from 'react';
import { Broadcast } from 'yours-wallet-provider';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { BSV_DECIMAL_CONVERSION } from '../../utils/constants';
import { sleep } from '../../utils/sleep';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import { useServiceContext } from '../../hooks/useServiceContext';
import { Transaction, Utils } from '@bsv/sdk';

export type BroadcastResponse = {
  txid: string;
};

export type BroadcastRequestProps = {
  request: Broadcast;
  popupId: number | undefined;
  onBroadcast: () => void;
};

export const BroadcastRequest = (props: BroadcastRequestProps) => {
  const { request, onBroadcast, popupId } = props;
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [txid, setTxid] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [satsOut, setSatsOut] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const { keysService, bsvService, chromeStorageService, oneSatSPV } = useServiceContext();
  const { updateBsvBalance } = bsvService;
  const { bsvAddress } = keysService;
  // const { isProcessing, setIsProcessing, updateBsvBalance, fundRawTx, bsvAddress } = useBsv();

  useEffect(() => {
    setSelected('bsv');
  }, [setSelected]);

  const resetSendState = () => {
    setTxid('');
    setIsProcessing(false);
  };

  useEffect(() => {
    if (!txid) return;
    if (!message && txid) {
      resetSendState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, txid]);

  useEffect(() => {
    if (!bsvAddress || !oneSatSPV) return;
    (async () => {
      const tx = Transaction.fromHex(request.rawtx);
      for (const input of tx.inputs) {
        input.sourceTransaction = await oneSatSPV.getTx(input.sourceTXID ?? '', true);
      }
      let outSats = tx.getFee();
      const changePkh = Utils.fromBase58Check(bsvAddress, 'hex').data as string;
      for (let index = 0; index < tx.outputs.length; index++) {
        const outputPkh = Utils.toHex(tx.outputs[index]?.lockingScript?.chunks[2]?.data ?? []);
        if (outputPkh !== changePkh) {
          const output = tx.outputs[index];
          if (!output) continue;
          outSats += output.satoshis || 0;
        }
      }
      setSatsOut(outSats);
    })();
  }, [bsvAddress, request.fund, request.rawtx, oneSatSPV]);

  const handleBroadcast = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    let rawtx = request.rawtx;
    if (request.fund) {
      if (!passwordConfirm) {
        addSnackbar('Must enter a password!', 'error');
        setIsProcessing(false);
        return;
      }

      const res = await bsvService.fundRawTx(rawtx, passwordConfirm);
      if (!res.rawtx || res.error) {
        const message =
          res.error === 'invalid-password'
            ? 'Invalid Password!'
            : 'An unknown error has occurred! Try again.' + res.error;

        addSnackbar(message, 'error');
        setIsProcessing(false);
        return;
      }
      rawtx = res.rawtx;
    }
    const resp = await oneSatSPV.broadcast(Transaction.fromHex(rawtx));
    if (resp.status === 'error') {
      addSnackbar('Error broadcasting the raw tx!', 'error');
      setIsProcessing(false);
      sendMessage({
        action: 'broadcastResponse',
        error: resp.description ?? 'Unknown error',
      });
      onBroadcast();
      return;
    }
    setTxid(resp.txid);
    sendMessage({
      action: 'broadcastResponse',
      txid: resp.txid,
    });

    setIsProcessing(false);
    addSnackbar('Successfully broadcasted the tx!', 'success');
    onBroadcast();
    setTimeout(async () => {
      await updateBsvBalance(true).catch((e: unknown) => {
        console.log(e);
      });
    }, 3000);
  };

  const clearRequest = async () => {
    await chromeStorageService.remove('broadcastRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Broadcasting transaction..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <BackButton onClick={clearRequest} />
          <HeaderText theme={theme}>Broadcast Raw Tx</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            The app is requesting to broadcast a transaction.
          </Text>
          <FormContainer noValidate onSubmit={(e) => handleBroadcast(e)}>
            <Show when={!!request.fund && satsOut > 0}>
              <Input
                theme={theme}
                placeholder="Enter Wallet Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Text theme={theme} style={{ margin: '1rem' }}>
              Double check details before sending.
            </Text>
            <Button
              theme={theme}
              type="primary"
              label={`Broadcast - ${satsOut / BSV_DECIMAL_CONVERSION} BSV`}
              disabled={isProcessing}
              isSubmit
            />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
