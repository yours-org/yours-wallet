import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { validate } from 'bitcoin-address-validation';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { formatNumberWithCommasAndDecimals, truncate } from '../../utils/format';
import { sleep } from '../../utils/sleep';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import { SendMNEE } from 'yours-wallet-provider';
import { useServiceContext } from '../../hooks/useServiceContext';
import { getErrorMessage } from '../../utils/tools';
import { MNEE_DECIMALS, MNEE_ICON_URL } from '../../utils/constants';
import { ChromeStorageObject } from '../../services/types/chromeStorage.types';

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
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, mneeService, keysService } = useServiceContext();
  const [isProcessing, setIsProcessing] = useState(false);

  const processMNEESend = async (password: string) => {
    try {
      const validationFail = new Map<string, boolean>();
      validationFail.set('address', false);

      for (const req of request) {
        if (req.address && !validate(req.address)) {
          validationFail.set('address', true);
          break;
        }
        if (req.amount && !req.amount) {
          validationFail.set('amount', true);
          break;
        }
      }

      let validationErrorMessage = '';
      if (validationFail.get('address')) {
        validationErrorMessage = 'Found an invalid receive address.';
      }

      if (validationFail.get('amount')) {
        validationErrorMessage = 'Found an invalid amount.';
      }

      if (validationErrorMessage) {
        addSnackbar(validationErrorMessage, 'error');
        return;
      }

      const keys = await keysService.retrieveKeys(password);
      if (!keys?.walletWif) {
        addSnackbar('Invalid password!', 'error');
        setIsProcessing(false);
        return;
      }
      // Initiate the transfer with broadcast flag
      const sendRes = await mneeService.transfer(request, keys.walletWif, { broadcast: true });

      // Handle ticket-based response
      if (sendRes.ticketId) {
        addSnackbar('Transaction initiated. Processing...', 'info');

        // Poll for transaction status
        let finalStatus = null;
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts with 2 second intervals = 60 seconds max

        while (attempts < maxAttempts) {
          await sleep(2000); // Wait 2 seconds between polls

          try {
            const status = await mneeService.getTxStatus(sendRes.ticketId);

            if (status.status === 'SUCCESS' || status.status === 'MINED') {
              finalStatus = status;
              break;
            } else if (status.status === 'FAILED') {
              addSnackbar(`Transaction failed: ${status.errors || 'Unknown error'}`, 'error');
              setIsProcessing(false);
              return;
            }
            // If BROADCASTING, continue polling
          } catch (pollError) {
            console.error('Error polling transaction status:', pollError);
          }

          attempts++;
        }

        if (!finalStatus) {
          addSnackbar('Transaction timeout. Please check your transaction history.', 'error');
          setIsProcessing(false);
          return;
        }

        // Transaction successful
        addSnackbar('Transaction Successful!', 'success');

        // Fetch updated MNEE balance and update Chrome storage
        const balanceRes = await mneeService.balance(keysService.bsvAddress);
        if (balanceRes) {
          const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
          if (account && selectedAccount) {
            const key: keyof ChromeStorageObject = 'accounts';
            const update: Partial<ChromeStorageObject['accounts']> = {
              [selectedAccount]: {
                ...account,
                mneeBalance: {
                  amount: balanceRes.amount,
                  decimalAmount: balanceRes.decimalAmount,
                },
              },
            };
            await chromeStorageService.updateNested(key, update);
          }
        }

        onResponse();

        sendMessage({
          action: 'sendMNEEResponse',
          txid: finalStatus.tx_id,
          rawtx: finalStatus.tx_hex,
        });
      } else if (sendRes.rawtx) {
        // Legacy response with raw transaction (shouldn't happen with broadcast: true)
        addSnackbar('Transaction created but not broadcast. Please try again.', 'info');
        setIsProcessing(false);
        return;
      } else {
        // No valid response
        addSnackbar('Transfer failed. No valid response from server.', 'error');
        setIsProcessing(false);
        return;
      }
    } catch (error: unknown) {
      console.log(error);
      // Check for specific error messages
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
    await sleep(25);

    if (!passwordConfirm) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    processMNEESend(passwordConfirm);
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
            <Input
              theme={theme}
              placeholder="Enter Wallet Password"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
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
