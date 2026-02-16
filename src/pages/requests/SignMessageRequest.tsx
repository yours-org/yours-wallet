import React, { useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { SignedMessage, SignMessage } from 'yours-wallet-provider';
import { Button } from '../../components/Button';
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
import { getErrorMessage } from '../../utils/tools';
import { signMessage } from '@1sat/actions';

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

const TagText = styled(Text)`
  margin: 0.25rem;
`;

export type SignMessageRequestProps = {
  request: SignMessage;
  popupId: number | undefined;
  onSignature: () => void;
};

export const SignMessageRequest = (props: SignMessageRequestProps) => {
  const { request, onSignature, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const [signature, setSignature] = useState<string | undefined>(undefined);
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, apiContext } = useServiceContext();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const resetSendState = () => {
    setIsProcessing(false);
  };

  useEffect(() => {
    if (!signature) return;
    if (!message && signature) {
      resetSendState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, signature]);

  const handleSigning = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    const signRes = await signMessage.execute(apiContext, request);
    if ('error' in signRes) {
      addSnackbar(getErrorMessage(signRes.error), 'error');
      setIsProcessing(false);
      return;
    }

    addSnackbar('Successfully Signed!', 'success');
    await sleep(2000);
    setSignature(signRes.sig);
    sendMessage({
      action: 'signMessageResponse',
      ...signRes,
    });
    onSignature();
  };

  const clearRequest = async () => {
    sendMessage({
      action: 'signMessageResponse',
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('signMessageRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Signing Transaction..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Sign Message</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            {'The app is requesting a signature using derivation tag:'}
          </Text>
          <Show
            when={!!request.tag?.label}
            whenFalseContent={
              <>
                <TagText theme={theme}>{`Label: yours`}</TagText>
                <TagText theme={theme}>{`Id: identity`}</TagText>
              </>
            }
          >
            <TagText theme={theme}>{`Label: ${request.tag?.label}`}</TagText>
            <TagText theme={theme}>{`Id: ${request.tag?.id}`}</TagText>
          </Show>
          <FormContainer noValidate onSubmit={(e) => handleSigning(e)}>
            <RequestDetailsContainer theme={theme}>
              {
                <Text
                  theme={theme}
                  style={{
                    color: theme.color.global.contrast,
                  }}
                >{`Message: ${request.message}`}</Text>
              }
            </RequestDetailsContainer>
            <Button theme={theme} type="primary" label="Sign Message" disabled={isProcessing} isSubmit />
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
