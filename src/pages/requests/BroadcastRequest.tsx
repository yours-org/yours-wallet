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
import { getTxFromRawTxFormat } from '../../utils/tools';
import { IndexContext } from 'spv-store';
import TxPreview from '../../components/TxPreview';
import { styled } from 'styled-components';

const Wrapper = styled(ConfirmContent)`
  max-height: calc(100vh - 8rem);
  overflow-y: auto;
`;

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
  const { setSelected, hideMenu } = useBottomMenu();
  const [txid, setTxid] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [satsOut, setSatsOut] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [txData, setTxData] = useState<IndexContext>();
  const { keysService, bsvService, chromeStorageService, oneSatSPV } = useServiceContext();
  const { updateBsvBalance } = bsvService;
  const { bsvAddress, ordAddress, identityAddress } = keysService;

  useEffect(() => {
    (async () => {
      if (!request.rawtx || !oneSatSPV || !!txData) return;
      setIsLoading(true);
      const tx = getTxFromRawTxFormat(request.rawtx, request.format || 'tx');
      const parsedTx = await oneSatSPV.parseTx(tx);
      setTxData(parsedTx);
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelected('bsv');
    hideMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!bsvAddress || !ordAddress || !identityAddress || !oneSatSPV || !txData) return;
    (async () => {
      console.log(bsvAddress, ordAddress, identityAddress);
      // how much did the user put in to the tx
      let userSatsOut = txData.spends.reduce((acc, spend) => {
        console.log(`Spend owner: ${spend.owner}`);
        console.log(`Spend satoshis: ${spend.satoshis}`);
        if (spend.owner && [bsvAddress, ordAddress, identityAddress].includes(spend.owner)) {
          return acc + spend.satoshis;
        }
        return acc;
      }, 0n);

      // how much did the user get back from the tx
      userSatsOut = txData.txos.reduce((acc, txo) => {
        console.log(`Txo owner: ${txo.owner}`);
        console.log(`Txo satoshis: ${txo.satoshis}`);
        if (txo.owner && [bsvAddress, ordAddress, identityAddress].includes(txo.owner)) {
          return acc - txo.satoshis;
        }
        return acc;
      }, userSatsOut);

      console.log(`User sats: ${userSatsOut}`);
      setSatsOut(Number(userSatsOut));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txData]);

  const handleBroadcast = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
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
      const tx = getTxFromRawTxFormat(rawtx, request.format || 'tx');

      const resp = await oneSatSPV.broadcast(tx);
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
        await updateBsvBalance().catch((e: unknown) => {
          console.log(e);
        });
      }, 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearRequest = async () => {
    await chromeStorageService.remove('broadcastRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing || isLoading}>
        <PageLoader theme={theme} message={isLoading ? 'Loading request...' : 'Broadcasting transaction...'} />
      </Show>
      <Show when={!isProcessing && !isLoading && !!request && !!txData}>
        <Wrapper>
          <BackButton onClick={clearRequest} />
          <HeaderText theme={theme}>Broadcast Raw Tx</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0', textAlign: 'center' }}>
            The app is requesting to broadcast a transaction.
          </Text>
          <FormContainer noValidate onSubmit={handleBroadcast}>
            <Show when={!!request.fund && satsOut > 0}>
              <Input
                theme={theme}
                placeholder="Enter Wallet Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            {txData && <TxPreview txData={txData} />}
            <Button
              theme={theme}
              type="primary"
              label={`Broadcast - ${satsOut / BSV_DECIMAL_CONVERSION} BSV`}
              disabled={isProcessing}
              isSubmit
            />
          </FormContainer>
        </Wrapper>
      </Show>
    </>
  );
};
