import React, { useEffect, useState } from 'react';
import { GetSignatures, SignatureResponse } from 'yours-wallet-provider';
import { BackButton } from '../../components/BackButton';
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
import { sleep } from '../../utils/sleep';
import TxPreview from '../../components/TxPreview';
import { IndexContext } from 'spv-store';
import { getTxFromRawTxFormat } from '../../utils/tools';
import { styled } from 'styled-components';

const Wrapper = styled(ConfirmContent)`
  max-height: calc(100vh - 8rem);
  overflow-y: auto;
`;

export type GetSignaturesResponse = {
  sigResponses?: SignatureResponse[];
  error?: string;
};

export type GetSignaturesRequestProps = {
  request: GetSignatures;
  popupId: number | undefined;
  onSignature: () => void;
};

export const GetSignaturesRequest = (props: GetSignaturesRequestProps) => {
  const { theme } = useTheme();
  const { setSelected, hideMenu } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, contractService, oneSatSPV } = useServiceContext();
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const [txData, setTxData] = useState<IndexContext>();
  const { request, onSignature, popupId } = props;
  const [getSigsResponse, setGetSigsResponse] = useState<{
    sigResponses?: SignatureResponse[] | undefined;
    error?:
      | {
          message: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cause?: any;
        }
      | undefined;
  }>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!request.rawtx || !oneSatSPV) return;
      setIsLoading(true);
      const tx = getTxFromRawTxFormat(request.rawtx, request.format || 'tx');
      const parsedTx = await oneSatSPV.parseTx(tx);
      setTxData(parsedTx);
      setIsLoading(false);
    })();
  }, [oneSatSPV, request]);

  useEffect(() => {
    setSelected('bsv');
    hideMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSelected]);

  const resetSendState = () => {
    setPasswordConfirm('');
    setGetSigsResponse(undefined);
    setIsProcessing(false);
  };

  useEffect(() => {
    if (!getSigsResponse) return;
    if (!message && getSigsResponse) {
      resetSendState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, getSigsResponse]);

  const handleSigning = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error', 3000);
      setIsProcessing(false);
      return;
    }

    const getSigsRes = await contractService.getSignatures(request, passwordConfirm);

    if (getSigsRes?.error) {
      const message =
        getSigsRes.error.message === 'invalid-password'
          ? 'Invalid Password!'
          : getSigsRes.error.message === 'unknown-address'
            ? 'Unknown Address: ' + (getSigsRes.error.cause ?? '')
            : 'An unknown error has occurred! Try again.';

      sendMessage({
        action: 'getSignaturesResponse',
        ...getSigsRes,
      });

      setIsProcessing(false);

      addSnackbar(message, 'error', 3000);

      return;
    }

    setGetSigsResponse(getSigsRes);
    sendMessage({
      action: 'getSignaturesResponse',
      ...getSigsRes,
    });

    setIsProcessing(false);

    addSnackbar('Successfully Signed!', 'success');
    onSignature();
  };

  const rejectSigning = async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();
    if (popupId) removeWindow(popupId);
    await chromeStorageService.remove('getSignaturesRequest');
  };

  const clearRequest = async () => {
    await chromeStorageService.remove('getSignaturesRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing || isLoading}>
        <PageLoader theme={theme} message={isLoading ? 'Loading transaction...' : 'Signing Transaction...'} />
      </Show>
      <Show when={!isProcessing && !!request && !!txData}>
        <Wrapper>
          <BackButton onClick={clearRequest} />
          <HeaderText theme={theme}>Sign Transaction</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            The app is requesting signatures for a transaction.
          </Text>
          <FormContainer noValidate onSubmit={(e) => handleSigning(e)}>
            {txData && <TxPreview txData={txData} inputsToSign={request.sigRequests.map((r) => r.inputIndex)} />}
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Enter Wallet Password"
                type="password"
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Button theme={theme} type="primary" label="Sign the transaction" isSubmit disabled={isProcessing} />
            <Button
              theme={theme}
              type="secondary"
              label="Cancel"
              disabled={isProcessing}
              onClick={rejectSigning}
              style={{ marginTop: '0' }}
            />
          </FormContainer>
        </Wrapper>
      </Show>
    </>
  );
};
