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
import type { CreateSignatureArgs, CreateSignatureResult } from '../../cwi';
import { CWIEventName } from '../../cwi';
import { Keys } from '../../utils/keys';
import { BigNumber, ECDSA, Hash, PrivateKey, Utils } from '@bsv/sdk';

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

export type CWICreateSignatureRequestProps = {
  request: CreateSignatureArgs;
  popupId: number | undefined;
  onSignature: () => void;
};

export const CWICreateSignatureRequest = (props: CWICreateSignatureRequestProps) => {
  const { request, onSignature, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [hasSigned, setHasSigned] = useState(false);
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
    if (!hasSigned) return;
    if (!message && hasSigned) {
      resetSendState();
    }
  }, [message, hasSigned]);

  const handleSigning = async (e: React.FormEvent<HTMLFormElement>) => {
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

      // Use identity key for signing (BRC-100 key derivation not yet implemented)
      const privateKey = PrivateKey.fromWif(keys.identityWif);

      // Determine what to sign
      let hashToSign: number[];
      if (request.hashToDirectlySign) {
        hashToSign = request.hashToDirectlySign;
      } else if (request.data) {
        // Hash the data with SHA256
        hashToSign = Hash.sha256(request.data);
      } else {
        addSnackbar('No data to sign', 'error');
        setIsProcessing(false);
        return;
      }

      // Sign the hash - convert to BigNumber for ECDSA
      const hashBN = new BigNumber(hashToSign);
      const signature = ECDSA.sign(hashBN, privateKey, true);
      // toDER returns hex string, convert to number array
      const signatureDER = signature.toDER() as unknown as string;
      const signatureBytes = Utils.toArray(signatureDER, 'hex');

      const result: CreateSignatureResult = {
        signature: signatureBytes,
      };

      addSnackbar('Successfully Signed!', 'success');
      await sleep(1000);
      setHasSigned(true);

      sendMessage({
        action: CWIEventName.CREATE_SIGNATURE_RESPONSE,
        ...result,
      });
      onSignature();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addSnackbar(errorMsg, 'error');
      setIsProcessing(false);
    }
  };

  const clearRequest = async () => {
    sendMessage({
      action: CWIEventName.CREATE_SIGNATURE_RESPONSE,
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('cwiCreateSignatureRequest');
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
        <PageLoader theme={theme} message="Creating Signature..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Create Signature</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            {'An app is requesting a cryptographic signature:'}
          </Text>
          <RequestDetailsContainer theme={theme}>
            <Show when={!!request.protocolID}>
              <DetailText theme={theme}>
                Protocol: [{request.protocolID?.[0]}] {request.protocolID?.[1]}
              </DetailText>
            </Show>
            <Show when={!!request.keyID}>
              <DetailText theme={theme}>Key ID: {request.keyID}</DetailText>
            </Show>
            <Show when={!!request.data}>
              <DetailText theme={theme}>Data: {formatData(request.data)}</DetailText>
            </Show>
            <Show when={!!request.hashToDirectlySign}>
              <DetailText theme={theme}>Hash: {formatData(request.hashToDirectlySign)}</DetailText>
            </Show>
          </RequestDetailsContainer>
          <FormContainer noValidate onSubmit={(e) => handleSigning(e)}>
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Enter Wallet Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Button theme={theme} type="primary" label="Sign" disabled={isProcessing} isSubmit />
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
