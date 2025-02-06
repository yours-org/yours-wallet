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

const Icon = styled.img`
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
`;

export type MNEESendRequestProps = {
  request: SendMNEE;
  popupId: number | undefined;
  onResponse: () => void;
};

export const MNEESendRequest = (props: MNEESendRequestProps) => {
  const { request, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, mneeService } = useServiceContext();
  const [isProcessing, setIsProcessing] = useState(false);

  const processMNEESend = async (password: string) => {
    try {
      const validationFail = new Map<string, boolean>();
      validationFail.set('address', false);

      if (request.address && !validate(request.address)) {
        validationFail.set('address', true);
        return;
      }
      let validationErrorMessage = '';
      if (validationFail.get('address')) {
        validationErrorMessage = 'Found an invalid receive address.';
      }

      if (validationErrorMessage) {
        addSnackbar(validationErrorMessage, 'error');
        return;
      }

      if (request.address && !request.amount) {
        addSnackbar('No amount supplied', 'info');
        return;
      }

      const sendRes = await mneeService.transfer(request.address, request.amount, password);
      if (!sendRes.txid || !sendRes.rawtx || sendRes.error) {
        addSnackbar(getErrorMessage(sendRes.error), 'error');
        setIsProcessing(false);
        return;
      }

      addSnackbar('Transaction Successful!', 'success');
      await sleep(2000);
      await mneeService.getBalance();
      onResponse();

      sendMessage({
        action: 'sendMNEEResponse',
        txid: sendRes.txid,
        rawtx: sendRes.rawtx,
      });
    } catch (error) {
      console.log(error);
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
    await chromeStorageService.remove('sendMNEERequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Sending MNEE..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <Icon src={MNEE_ICON_URL} />
          <HeaderText theme={theme}>Approve Request</HeaderText>
          <Text
            theme={theme}
            style={{ cursor: 'pointer', margin: '0.75rem 0', color: theme.color.global.gray }}
          >{`Send to: ${truncate(request.address, 5, 5)}`}</Text>
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
              label={`Approve ${formatNumberWithCommasAndDecimals(request.amount, MNEE_DECIMALS)} MNEE`}
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
