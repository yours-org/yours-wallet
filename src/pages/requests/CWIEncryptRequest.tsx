import React, { useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useServiceContext } from '../../hooks/useServiceContext';
import { WhiteLabelTheme } from '../../theme.types';
import { sleep } from '../../utils/sleep';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import type { WalletEncryptArgs } from '@bsv/sdk';
import { CWIEventName } from '../../cwi';
import type { Keys } from '../../utils/keys';
import { Utils } from '@bsv/sdk';
import { initSigningWallet } from '../../initWallet';

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
  padding: 0.5rem;
`;

const DetailText = styled(Text)`
  margin: 0.25rem;
  font-size: 0.75rem;
  word-break: break-all;
`;

export type CWIEncryptRequestProps = {
  request: WalletEncryptArgs;
  popupId: number | undefined;
  onEncrypt: () => void;
};

export const CWIEncryptRequest = (props: CWIEncryptRequestProps) => {
  const { request, onEncrypt, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [hasEncrypted, setHasEncrypted] = useState(false);
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, keysService } = useServiceContext();
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const resetSendState = () => {
    setPasswordConfirm('');
    setIsProcessing(false);
  };

  useEffect(() => {
    if (!hasEncrypted) return;
    if (!message && hasEncrypted) {
      resetSendState();
    }
  }, [message, hasEncrypted]);

  const handleEncryption = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    try {
      // Get keys with password and create signing wallet
      const keys = (await keysService.retrieveKeys(passwordConfirm)) as Keys;
      const wallet = await initSigningWallet(chromeStorageService, keys);
      const result = await wallet.encrypt(request);

      addSnackbar('Successfully Encrypted!', 'success');
      await sleep(1000);
      setHasEncrypted(true);

      sendMessage({
        action: CWIEventName.ENCRYPT_RESPONSE,
        ...result,
      });
      onEncrypt();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addSnackbar(errorMsg, 'error');
      setIsProcessing(false);
    }
  };

  const clearRequest = async () => {
    sendMessage({
      action: CWIEventName.ENCRYPT_RESPONSE,
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('cwiEncryptRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  // Format data for display
  const formatData = (data: number[] | undefined): string => {
    if (!data) return 'None';
    if (data.length <= 32) {
      return Utils.toHex(data);
    }
    return `${Utils.toHex(data.slice(0, 16))}...${Utils.toHex(data.slice(-16))} (${data.length} bytes)`;
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Encrypting..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Encrypt Data</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            {'An app is requesting to encrypt data:'}
          </Text>
          <RequestDetailsContainer theme={theme}>
            <Show when={!!request.protocolID}>
              <DetailText theme={theme}>
                Protocol: [{request.protocolID[0]}] {request.protocolID[1]}
              </DetailText>
            </Show>
            <Show when={!!request.keyID}>
              <DetailText theme={theme}>Key ID: {request.keyID}</DetailText>
            </Show>
            <Show when={!!request.counterparty}>
              <DetailText theme={theme}>
                Counterparty: {request.counterparty === 'self' ? 'Self' : request.counterparty}
              </DetailText>
            </Show>
            <Show when={!!request.plaintext}>
              <DetailText theme={theme}>Plaintext: {formatData(request.plaintext)}</DetailText>
            </Show>
          </RequestDetailsContainer>
          <FormContainer noValidate onSubmit={(e) => handleEncryption(e)}>
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Enter Wallet Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Button theme={theme} type="primary" label="Encrypt" disabled={isProcessing} isSubmit />
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
