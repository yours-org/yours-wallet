import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { validate } from 'bitcoin-address-validation';
import { Button } from '../../components/Button';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { formatNumberWithCommasAndDecimals, truncate } from '../../utils/format';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import { SendMNEE } from 'yours-wallet-provider';
import { useServiceContext } from '../../hooks/useServiceContext';
import { getErrorMessage } from '../../utils/tools';
import { MNEE_DECIMALS, MNEE_ICON_URL } from '../../utils/constants';
import { ChromeStorageObject } from '../../services/types/chromeStorage.types';
import { sendMnee, deriveDepositAddresses, getMneeBalance } from '@1sat/actions';

const YOURS_PREFIX = 'yours';
const YOURS_ADDRESS_COUNT = 5;

const Icon = styled.img`
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
`;

export type MNEESendRequestProps = {
  request: SendMNEE[];
  popupId: number | undefined;
  onResponse: () => void;
};

export const MNEESendRequest = (props: MNEESendRequestProps) => {
  const { request, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, apiContext } = useServiceContext();
  const [isProcessing, setIsProcessing] = useState(false);

  const processMNEESend = async () => {
    try {
      // Validate addresses
      for (const req of request) {
        if (req.address && !validate(req.address)) {
          addSnackbar('Found an invalid receive address.', 'error');
          return;
        }
        if (!req.amount || req.amount <= 0) {
          addSnackbar('Found an invalid amount.', 'error');
          return;
        }
      }

      if (!apiContext) {
        addSnackbar('Wallet not ready.', 'error');
        return;
      }

      // Derive addresses for signing
      const derivationResult = await deriveDepositAddresses.execute(apiContext, {
        prefix: YOURS_PREFIX,
        startIndex: 0,
        count: YOURS_ADDRESS_COUNT,
      });

      addSnackbar('Transaction initiated. Processing...', 'info');

      // Send MNEE using BRC-100 signing (no WIF needed)
      // The action handles building, signing, submitting, and polling for txid
      const sendRes = await sendMnee.execute(apiContext, {
        recipients: request.map((r) => ({ address: r.address, amount: r.amount })),
        derivations: derivationResult.derivations,
      });

      if (sendRes.error) {
        if (sendRes.error === 'timeout-waiting-for-txid') {
          addSnackbar('Transaction timeout. Please check your transaction history.', 'error');
        } else {
          addSnackbar(`Transaction failed: ${sendRes.error}`, 'error');
        }
        setIsProcessing(false);
        return;
      }

      // Transaction successful
      addSnackbar('Transaction Successful!', 'success');

      // Fetch updated MNEE balance and update Chrome storage
      const addresses = derivationResult.derivations.map((d) => d.address);
      try {
        const balanceRes = await getMneeBalance.execute(apiContext, { addresses });
        const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
        if (account && selectedAccount) {
          const key: keyof ChromeStorageObject = 'accounts';
          const update: Partial<ChromeStorageObject['accounts']> = {
            [selectedAccount]: {
              ...account,
              mneeBalance: {
                amount: balanceRes.totalAtomic,
                decimalAmount: balanceRes.totalDecimal,
              },
            },
          };
          await chromeStorageService.updateNested(key, update);
        }
      } catch {
        // Balance update is best-effort
      }

      onResponse();

      sendMessage({
        action: 'sendMNEEResponse',
        txid: sendRes.txid,
      });
    } catch (error: unknown) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('status: 423')) {
        addSnackbar('The sending or receiving address may be frozen. Please contact support.', 'error');
      } else {
        addSnackbar(getErrorMessage(errorMessage) || 'Transfer failed. Please try again.', 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSelect, hideMenu]);

  const handleSendMNEE = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    processMNEESend();
  };

  const clearRequest = async () => {
    sendMessage({
      action: 'sendMNEEResponse',
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('sendMNEERequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  const totalAmount = request.reduce((acc, req) => acc + req.amount, 0);

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Sending MNEE..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <Icon src={MNEE_ICON_URL} />
          <HeaderText theme={theme}>Approve Request</HeaderText>
          <Text theme={theme} style={{ cursor: 'pointer', margin: '0.75rem 0', color: theme.color.global.gray }}>
            {request.length === 1 ? `Send to: ${truncate(request[0].address, 5, 5)}` : 'Send to multiple recipients.'}
          </Text>
          <FormContainer noValidate onSubmit={(e) => handleSendMNEE(e)}>
            <Text theme={theme} style={{ margin: '1rem' }}>
              Double check details before sending.
            </Text>
            <Button
              theme={theme}
              type="primary"
              label={`Approve ${formatNumberWithCommasAndDecimals(totalAmount, MNEE_DECIMALS)} MNEE`}
              disabled={isProcessing}
              isSubmit
            />
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
