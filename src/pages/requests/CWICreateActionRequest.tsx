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
import type { CreateActionArgs, CreateActionResult } from '../../cwi';
import { CWIEventName } from '../../cwi';
import { Keys } from '../../utils/keys';

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

export type CWICreateActionRequestProps = {
  request: CreateActionArgs;
  popupId: number | undefined;
  onAction: () => void;
};

export const CWICreateActionRequest = (props: CWICreateActionRequestProps) => {
  const { request, onAction, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [hasCreated, setHasCreated] = useState(false);
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, keysService, wallet } = useServiceContext();
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const resetState = () => {
    setPasswordConfirm('');
    setIsProcessing(false);
  };

  useEffect(() => {
    if (!hasCreated) return;
    if (!message && hasCreated) {
      resetState();
    }
  }, [message, hasCreated]);

  const handleCreateAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    try {
      // Get keys with password to verify authentication
      const keys = (await keysService.retrieveKeys(passwordConfirm)) as Keys;
      if (!keys?.identityWif) {
        addSnackbar('Failed to retrieve keys', 'error');
        setIsProcessing(false);
        return;
      }

      // Use the wallet's createAction if available
      if (!wallet) {
        addSnackbar('Wallet not initialized', 'error');
        setIsProcessing(false);
        return;
      }

      // Call the wallet's createAction method
      // Note: The wallet expects specific types for inputs/outputs
      // BRC-100 uses more generic Record<string, unknown> types
      // We cast here, trusting the app sends correctly shaped data
      const actionResult = await wallet.createAction({
        description: request.description,
        inputs: request.inputs as Parameters<typeof wallet.createAction>[0]['inputs'],
        outputs: request.outputs as Parameters<typeof wallet.createAction>[0]['outputs'],
        lockTime: request.lockTime,
        version: request.version,
        labels: request.labels,
        options: request.options as Parameters<typeof wallet.createAction>[0]['options'],
      });

      const result: CreateActionResult = {
        txid: actionResult.txid,
        tx: actionResult.tx ? Array.from(actionResult.tx) : undefined,
        noSendChange: actionResult.noSendChange,
        sendWithResults: actionResult.sendWithResults,
        signableTransaction: actionResult.signableTransaction,
      };

      addSnackbar('Action Created Successfully!', 'success');
      await sleep(1000);
      setHasCreated(true);

      sendMessage({
        action: CWIEventName.CREATE_ACTION_RESPONSE,
        ...result,
      });
      onAction();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addSnackbar(errorMsg, 'error');
      setIsProcessing(false);
    }
  };

  const clearRequest = async () => {
    sendMessage({
      action: CWIEventName.CREATE_ACTION_RESPONSE,
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('cwiCreateActionRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  // Calculate total output value
  const totalOutputValue = request.outputs?.reduce((sum, output) => {
    const satoshis = (output as { satoshis?: number }).satoshis ?? 0;
    return sum + satoshis;
  }, 0) ?? 0;

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Creating Action..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Create Action</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            {'An app is requesting to create a transaction:'}
          </Text>
          <RequestDetailsContainer theme={theme}>
            <DetailText theme={theme}>
              <strong>Description:</strong> {request.description}
            </DetailText>
            <Show when={!!request.inputs?.length}>
              <DetailText theme={theme}>Inputs: {request.inputs?.length} input(s)</DetailText>
            </Show>
            <Show when={!!request.outputs?.length}>
              <DetailText theme={theme}>Outputs: {request.outputs?.length} output(s)</DetailText>
              <DetailText theme={theme}>Total Value: {totalOutputValue} satoshis</DetailText>
            </Show>
            <Show when={!!request.labels?.length}>
              <DetailText theme={theme}>Labels: {request.labels?.join(', ')}</DetailText>
            </Show>
          </RequestDetailsContainer>
          <FormContainer noValidate onSubmit={(e) => handleCreateAction(e)}>
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Enter Wallet Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Button theme={theme} type="primary" label="Create Action" disabled={isProcessing} isSubmit />
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
