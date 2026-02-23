import React, { useEffect, useState } from 'react';
import { Transaction } from '@bsv/sdk';
import { Button } from '../../components/Button';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import TxPreview from '../../components/TxPreview';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useServiceContext } from '../../hooks/useServiceContext';
import { removeWindow, sendMessage } from '../../utils/chromeHelpers';
import { sleep } from '../../utils/sleep';
import { styled } from 'styled-components';
import { BSV_DECIMAL_CONVERSION } from '../../utils/constants';
import type { ApprovalContext, YoursApprovalType } from '../../yoursApi';
import type { ParseContext } from '@1sat/wallet-remote';

const Wrapper = styled(ConfirmContent)`
  max-height: calc(100vh - 8rem);
  overflow-y: auto;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const InfoLabel = styled.span`
  opacity: 0.7;
`;

const InfoValue = styled.span`
  font-weight: 600;
`;

export type TransactionApprovalResponse = {
  approved: boolean;
  error?: string;
};

export type TransactionApprovalRequestProps = {
  request: ApprovalContext;
  popupId: number | undefined;
  onResponse: () => void;
};

// Map approval type to user-friendly title
const getApprovalTitle = (type: YoursApprovalType): string => {
  switch (type) {
    case 'sendBsv':
      return 'Send BSV';
    case 'sendAllBsv':
      return 'Send All BSV';
    case 'transferOrdinal':
      return 'Transfer Ordinal';
    case 'listOrdinal':
      return 'List Ordinal';
    case 'inscribe':
      return 'Create Inscription';
    case 'lockBsv':
      return 'Lock BSV';
    default:
      return 'Transaction';
  }
};

export const TransactionApprovalRequest = (props: TransactionApprovalRequestProps) => {
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, keysService, wallet } = useServiceContext();
  const { bsvAddress, ordAddress, identityAddress } = keysService;
  const { request, onResponse, popupId } = props;
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [txData, setTxData] = useState<ParseContext>();
  const [satsOut, setSatsOut] = useState(0);

  // Parse the signable transaction BEEF for preview
  useEffect(() => {
    (async () => {
      if (!request.signableTransactionBEEF || !wallet) return;
      setIsLoading(true);
      try {
        const tx = Transaction.fromAtomicBEEF(request.signableTransactionBEEF);
        const parsedTx = await wallet.parseTransaction(tx);
        setTxData(parsedTx);
      } catch (error) {
        console.error('Failed to parse transaction BEEF:', error);
      }
      setIsLoading(false);
    })();
  }, [wallet, request.signableTransactionBEEF]);

  // Calculate net sats out for the user
  useEffect(() => {
    if (!bsvAddress || !ordAddress || !identityAddress || !wallet || !txData) return;
    (async () => {
      const userAddresses = [bsvAddress, ordAddress, identityAddress];

      // How much did the user put into the tx (inputs they own)
      let userSatsOut = txData.spends.reduce((acc, spend) => {
        if (spend.owner && userAddresses.includes(spend.owner)) {
          return acc + BigInt(spend.output.satoshis || 0);
        }
        return acc;
      }, 0n);

      // How much does the user get back (outputs they own)
      userSatsOut = txData.txos.reduce((acc, txo) => {
        if (txo.owner && userAddresses.includes(txo.owner)) {
          return acc - BigInt(txo.output.satoshis || 0);
        }
        return acc;
      }, userSatsOut);

      setSatsOut(Number(userSatsOut));
    })();
  }, [txData, bsvAddress, ordAddress, identityAddress, wallet]);

  // Fallback to CreateActionArgs if BEEF parsing not available
  const totalOutputSats = request.createActionParams.outputs?.reduce((sum, output) => sum + output.satoshis, 0) || 0;

  const outputCount = request.createActionParams.outputs?.length || 0;
  const inputCount = request.createActionParams.inputs?.length || 0;

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const resetState = () => {
    setIsProcessing(false);
  };

  useEffect(() => {
    if (!message) {
      resetState();
    }
  }, [message]);

  const handleApprove = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    // Send approval response
    sendMessage({
      action: 'transactionApprovalResponse',
      approved: true,
    });

    onResponse();
    window.close();
  };

  const handleReject = async () => {
    sendMessage({
      action: 'transactionApprovalResponse',
      approved: false,
    });
    await chromeStorageService.remove('transactionApprovalRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  const title = getApprovalTitle(request.type);

  // Display amount: prefer calculated satsOut, fall back to totalOutputSats
  const displayAmount = txData ? satsOut : totalOutputSats;
  const amountLabel =
    displayAmount > 0 ? `Approve - ${(displayAmount / BSV_DECIMAL_CONVERSION).toFixed(8)} BSV` : 'Approve';

  return (
    <>
      <Show when={isProcessing || isLoading}>
        <PageLoader theme={theme} message={isLoading ? 'Loading transaction...' : 'Processing...'} />
      </Show>
      <Show when={!isProcessing && !isLoading && !!request}>
        <Wrapper>
          <HeaderText theme={theme}>{title}</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            {request.description}
          </Text>

          {/* Show TxPreview if BEEF was parsed successfully */}
          <Show when={!!txData}>{txData && <TxPreview txData={txData} />}</Show>

          {/* Fallback to basic info if no TxPreview */}
          <Show when={!txData}>
            <div style={{ marginBottom: '1rem' }}>
              {inputCount > 0 && (
                <InfoRow>
                  <InfoLabel>Inputs</InfoLabel>
                  <InfoValue>{inputCount}</InfoValue>
                </InfoRow>
              )}
              <InfoRow>
                <InfoLabel>Outputs</InfoLabel>
                <InfoValue>{outputCount}</InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>Total Output</InfoLabel>
                <InfoValue>{(totalOutputSats / BSV_DECIMAL_CONVERSION).toFixed(8)} BSV</InfoValue>
              </InfoRow>
            </div>
          </Show>

          <FormContainer noValidate onSubmit={(e) => handleApprove(e)}>
            <Button theme={theme} type="primary" label={amountLabel} isSubmit disabled={isProcessing} />
            <Button theme={theme} type="secondary" label="Reject" onClick={handleReject} disabled={isProcessing} />
          </FormContainer>
        </Wrapper>
      </Show>
    </>
  );
};
