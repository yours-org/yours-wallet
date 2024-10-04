import React, { useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { SignedMessage, SignMessage } from 'yours-wallet-provider';
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
import { getErrorMessage } from '../../utils/tools';

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
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [signature, setSignature] = useState<string | undefined>(undefined);
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, bsvService } = useServiceContext();
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

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signRes = (await bsvService.signMessage(request, passwordConfirm)) as SignedMessage & { error?: string };
    if (!signRes?.sig || signRes.error) {
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
                    color:
                      theme.color.global.primaryTheme === 'dark'
                        ? theme.color.global.contrast
                        : theme.color.global.neutral,
                  }}
                >{`Message: ${request.message}`}</Text>
              }
            </RequestDetailsContainer>
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Enter Wallet Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Button theme={theme} type="primary" label="Sign Message" disabled={isProcessing} isSubmit />
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
