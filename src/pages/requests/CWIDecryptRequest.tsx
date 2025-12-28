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
import type { WalletDecryptArgs, WalletDecryptResult } from '../../cwi';
import { CWIEventName } from '../../cwi';
import { Keys } from '../../utils/keys';
import { ECIES, PrivateKey, Utils } from '@bsv/sdk';

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

export type CWIDecryptRequestProps = {
  request: WalletDecryptArgs;
  popupId: number | undefined;
  onDecrypt: () => void;
};

export const CWIDecryptRequest = (props: CWIDecryptRequestProps) => {
  const { request, onDecrypt, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [hasDecrypted, setHasDecrypted] = useState(false);
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
    if (!hasDecrypted) return;
    if (!message && hasDecrypted) {
      resetSendState();
    }
  }, [message, hasDecrypted]);

  const handleDecryption = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    try {
      // Get keys with password
      const keys = (await keysService.retrieveKeys(passwordConfirm)) as Keys;
      if (!keys?.identityWif) {
        addSnackbar('Failed to retrieve keys', 'error');
        setIsProcessing(false);
        return;
      }

      // Use identity key for decryption (BRC-100 key derivation not yet implemented)
      const privateKey = PrivateKey.fromWif(keys.identityWif);

      // Decrypt the ciphertext using ECIES
      const plaintext = ECIES.electrumDecrypt(request.ciphertext, privateKey);

      const result: WalletDecryptResult = {
        plaintext: Array.from(plaintext),
      };

      addSnackbar('Successfully Decrypted!', 'success');
      await sleep(1000);
      setHasDecrypted(true);

      sendMessage({
        action: CWIEventName.DECRYPT_RESPONSE,
        ...result,
      });
      onDecrypt();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addSnackbar(errorMsg, 'error');
      setIsProcessing(false);
    }
  };

  const clearRequest = async () => {
    sendMessage({
      action: CWIEventName.DECRYPT_RESPONSE,
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('cwiDecryptRequest');
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
        <PageLoader theme={theme} message="Decrypting..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Decrypt Data</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            {'An app is requesting to decrypt data:'}
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
            <Show when={!!request.ciphertext}>
              <DetailText theme={theme}>Ciphertext: {formatData(request.ciphertext)}</DetailText>
            </Show>
          </RequestDetailsContainer>
          <FormContainer noValidate onSubmit={(e) => handleDecryption(e)}>
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Enter Wallet Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Button theme={theme} type="primary" label="Decrypt" disabled={isProcessing} isSubmit />
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
