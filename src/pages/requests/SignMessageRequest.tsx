import React, { useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { SignMessage } from 'yours-wallet-provider';
import { BackButton } from '../../components/BackButton';
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
  const { setSelected } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [signature, setSignature] = useState<string | undefined>(undefined);
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, bsvService } = useServiceContext();
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setSelected('bsv');
  }, [setSelected]);

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

    //TODO: This should not be any type. The signMessage method should be refactored to return provider type. Error handling should be done differently.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signRes: any = await bsvService.signMessage(request, passwordConfirm);
    if (!signRes?.sig) {
      const message =
        signRes?.error === 'invalid-password'
          ? 'Invalid Password!'
          : signRes?.error === 'key-type'
            ? 'Key type does not exist!'
            : 'An unknown error has occurred! Try again.';

      addSnackbar(message, 'error');
      setIsProcessing(false);
      return;
    }

    sendMessage({
      action: 'signMessageResponse',
      ...signRes,
    });

    addSnackbar('Successfully Signed!', 'success');
    setSignature(signRes.sig);
    setIsProcessing(false);
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
          <BackButton onClick={clearRequest} />
          <HeaderText theme={theme}>Sign Message</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            {'The app is requesting a signature using derivation tag:'}
          </Text>
          <Show
            when={!!request.tag?.label}
            whenFalseContent={
              <>
                <TagText theme={theme}>{`Label: panda`}</TagText>
                <TagText theme={theme}>{`Id: identity`}</TagText>
              </>
            }
          >
            <TagText theme={theme}>{`Label: ${request.tag?.label}`}</TagText>
            <TagText theme={theme}>{`Id: ${request.tag?.id}`}</TagText>
          </Show>
          <FormContainer noValidate onSubmit={(e) => handleSigning(e)}>
            <RequestDetailsContainer>
              {
                <Text
                  style={{
                    color:
                      theme.color.global.primaryTheme === 'dark' ? theme.color.global.white : theme.color.global.black,
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
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
