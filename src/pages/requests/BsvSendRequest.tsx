import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { validate } from 'bitcoin-address-validation';
import bsvCoin from '../../assets/bsv-coin.svg';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { WhiteLabelTheme } from '../../theme.types';
import { BSV_DECIMAL_CONVERSION } from '../../utils/constants';
import { truncate } from '../../utils/format';
import { sleep } from '../../utils/sleep';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import { SendBsv } from 'yours-wallet-provider';
import { useServiceContext } from '../../hooks/useServiceContext';

const RequestDetailsContainer = styled.div<WhiteLabelTheme>`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-height: 10rem;
  overflow-y: auto;
  overflow-x: hidden;
  background: ${({ theme }) => theme.color.global.row + '80'};
  margin: 0.5rem;
`;

const LineItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0.25rem;
  width: 60%;
  z-index: 100;
`;

const Icon = styled.img`
  width: 1rem;
  height: 1rem;
`;

export type BsvSendRequestProps = {
  request: SendBsv[];
  requestWithinApp?: boolean;
  popupId: number | undefined;
  onResponse: () => void;
};

export const BsvSendRequest = (props: BsvSendRequestProps) => {
  const { request, requestWithinApp, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { setSelected, hideMenu } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { bsvService, chromeStorageService, keysService } = useServiceContext();
  const { sendBsv, updateBsvBalance, getBsvBalance } = bsvService;
  const { bsvAddress } = keysService;
  const [hasSent, setHasSent] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { account } = chromeStorageService.getCurrentAccountObject();
  if (!account) throw Error('No account found');
  const { settings } = account;
  const noApprovalLimit = settings.noApprovalLimit ?? 0;
  const isPasswordRequired = chromeStorageService.isPasswordRequired();

  const requestSats = request.reduce((a: number, item: { satoshis: number }) => a + item.satoshis, 0);
  const bsvSendAmount = requestSats / BSV_DECIMAL_CONVERSION;

  const processBsvSend = async () => {
    try {
      const validationFail = new Map<string, boolean>();
      validationFail.set('address', false);
      validationFail.set('script', false);
      validationFail.set('data', false);

      request.forEach((req, idx) => {
        if (req.script?.length === 0) {
          validationFail.set('script', true);
          return;
        } else if (req.data) {
          if (req.data.length === 0) {
            validationFail.set('data', true);
            return;
          }
        }
        if (req.address) {
          if (req.address.includes('@')) {
            request[idx].paymail = req.address;
            request[idx].address = undefined;
            return;
          }
          if (!validate(req.address)) {
            validationFail.set('address', true);
            return;
          }
        }
      });

      let validationErrorMessage = '';
      if (validationFail.get('script')) {
        validationErrorMessage = 'Found an invalid script.';
      } else if (validationFail.get('data')) {
        validationErrorMessage = 'Found an invalid data.';
      } else if (validationFail.get('address')) {
        validationErrorMessage = 'Found an invalid receive address.';
      }

      if (validationErrorMessage) {
        addSnackbar(validationErrorMessage, 'error');
        return;
      }

      if (request[0].address && !request[0].satoshis) {
        addSnackbar('No sats supplied', 'info');
        return;
      }

      console.log(request);
      const sendRes = await sendBsv(request, passwordConfirm, noApprovalLimit);
      if (!sendRes.txid || sendRes.error) {
        const message =
          sendRes.error === 'invalid-password'
            ? 'Invalid Password!'
            : sendRes.error === 'insufficient-funds'
              ? 'Insufficient Funds!'
              : sendRes.error === 'fee-too-high'
                ? 'Miner fee too high!'
                : sendRes.error === 'no-wallet-address'
                  ? 'No wallet address found!'
                  : sendRes.error === 'invalid-data'
                    ? 'Invalid data!'
                    : sendRes.error === 'invalid-request'
                      ? 'Invalid request!'
                      : sendRes.error === 'source-tx-not-found'
                        ? 'Source transaction not found!'
                        : sendRes.error === 'no-account'
                          ? 'No account found!'
                          : 'An unknown error has occurred! Try again.';

        setIsProcessing(false);
        addSnackbar(message, 'error');
        return;
      }

      setSuccessTxId(sendRes.txid);
      addSnackbar('Transaction Successful!', 'success');
      await sleep(2000);
      onResponse();

      if (!requestWithinApp) {
        sendMessage({
          action: 'sendBsvResponse',
          txid: sendRes.txid,
          rawtx: sendRes.rawtx,
        });
      }
    } catch (error) {
      console.log(error);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (hasSent || noApprovalLimit === undefined) return;
    if (request.length > 0 && bsvSendAmount <= noApprovalLimit) {
      setHasSent(true);

      setTimeout(async () => {
        setIsProcessing(true);
        await processBsvSend();
        setIsProcessing(false);
        await updateBsvBalance();
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsvSendAmount, hasSent, noApprovalLimit]);

  useEffect(() => {
    if (requestWithinApp) return;
    setSelected('bsv');
    hideMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestWithinApp, setSelected]);

  const resetSendState = () => {
    setPasswordConfirm('');
    setSuccessTxId('');
    setIsProcessing(false);
  };

  useEffect(() => {
    if (!successTxId) return;
    if (!message && bsvAddress) {
      resetSendState();
      updateBsvBalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsvAddress, message, successTxId]);

  const handleSendBsv = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    if (noApprovalLimit === undefined) throw Error('No approval limit must be a number');
    if (!passwordConfirm && isPasswordRequired && bsvSendAmount > noApprovalLimit) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    processBsvSend();
  };

  const web3Details = () => {
    return request.map((r, i) => {
      return (
        <LineItem key={i}>
          <Icon src={bsvCoin} />
          <Text style={{ margin: 0 }} theme={theme}>{`${r.satoshis / BSV_DECIMAL_CONVERSION}`}</Text>
          <Text style={{ margin: 0 }} theme={theme}>
            {r.address ? truncate(r.address, 5, 5) : r.paymail ? truncate(r.paymail, 12, 0) : ''}
          </Text>
        </LineItem>
      );
    });
  };

  const clearRequest = async () => {
    await chromeStorageService.remove('sendBsvRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Sending BSV..." />
      </Show>
      <Show when={!isProcessing && !!request && !hasSent}>
        <ConfirmContent>
          <HeaderText theme={theme}>Approve Request</HeaderText>
          <Text
            theme={theme}
            style={{ cursor: 'pointer', margin: '0.75rem 0' }}
          >{`Available Balance: ${getBsvBalance()}`}</Text>
          <FormContainer noValidate onSubmit={(e) => handleSendBsv(e)}>
            <RequestDetailsContainer theme={theme}>{web3Details()}</RequestDetailsContainer>
            <Show when={isPasswordRequired}>
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
              label={`Approve ${request.reduce((a, item) => a + item.satoshis, 0) / BSV_DECIMAL_CONVERSION} BSV`}
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
