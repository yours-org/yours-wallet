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
import { GENERIC_TOKEN_ICON } from '../../utils/constants';
import { truncate } from '../../utils/format';
import { sleep } from '../../utils/sleep';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import { SendBsv20 } from 'yours-wallet-provider';
import { useServiceContext } from '../../hooks/useServiceContext';
import { normalize } from '../../utils/ordi';
import { Token } from '../../services/types/gorillaPool.types';
import { getErrorMessage } from '../../utils/tools';

const Icon = styled.img`
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
`;

export type Bsv20SendRequestProps = {
  request: SendBsv20;
  popupId: number | undefined;
  onResponse: () => void;
};

export const Bsv20SendRequest = (props: Bsv20SendRequestProps) => {
  const { request, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const { addSnackbar } = useSnackbar();
  const { ordinalService, chromeStorageService, gorillaPoolService } = useServiceContext();
  const { sendBSV20 } = ordinalService;
  const [isProcessing, setIsProcessing] = useState(false);
  const [token, setToken] = useState<Token>();
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const tokenIcon =
    (token?.icon && `${gorillaPoolService.getBaseUrl(chromeStorageService.getNetwork())}/content/${token.icon}`) ||
    GENERIC_TOKEN_ICON;

  useEffect(() => {
    (async () => {
      if (!request) return;
      const token = await gorillaPoolService.getBsv20Details(request.idOrTick);
      if (!token) return;
      setToken(token);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processBsv20Send = async () => {
    try {
      if (!token) return;
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

      const amtString = normalize(String(request.amount), token.dec);
      const sendRes = await sendBSV20(request.idOrTick, request.address, BigInt(amtString), passwordConfirm);
      if (!sendRes.txid || sendRes.error) {
        addSnackbar(getErrorMessage(sendRes.error), 'error');
        setIsProcessing(false);
        return;
      }

      addSnackbar('Transaction Successful!', 'success');
      await sleep(2000);
      onResponse();

      sendMessage({
        action: 'sendBsv20Response',
        txid: sendRes.txid,
        rawtx: sendRes.rawTx,
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

  const handleSendBsv20 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    processBsv20Send();
  };

  const clearRequest = async () => {
    sendMessage({
      action: 'sendBsv20Response',
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('sendBsv20Request');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Sending Token..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <Icon src={tokenIcon} />
          <HeaderText theme={theme}>Approve Request</HeaderText>
          <Text
            theme={theme}
            style={{ cursor: 'pointer', margin: '0.75rem 0', color: theme.color.global.gray }}
          >{`Send to: ${truncate(request.address, 5, 5)}`}</Text>
          <FormContainer noValidate onSubmit={(e) => handleSendBsv20(e)}>
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
              label={`Approve ${request.amount} ${token?.sym || token?.tick}`}
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
