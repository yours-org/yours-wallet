import React, { useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { Button } from '../../components/Button';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { WhiteLabelTheme } from '../../theme.types';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import type { PermissionRequest as PermissionRequestType } from '@bsv/wallet-toolbox-mobile';

const RequestDetailsContainer = styled.div<WhiteLabelTheme>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  max-height: 12rem;
  overflow-y: auto;
  overflow-x: hidden;
  background: ${({ theme }) => theme.color.global.row + '80'};
  margin: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
`;

const DetailRow = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
  margin: 0.25rem 0;
`;

const DetailLabel = styled(Text)`
  font-size: 0.75rem;
  font-weight: 600;
  min-width: 5rem;
  margin: 0;
`;

const DetailValue = styled(Text)`
  font-size: 0.75rem;
  word-break: break-all;
  margin: 0;
`;

const WarningText = styled(Text)`
  color: ${({ theme }) => theme.color.global.warning || '#f5a623'};
  font-size: 0.75rem;
  margin: 0.5rem 0;
`;

export type PermissionRequestProps = {
  request: PermissionRequestType & { requestID: string };
  popupId: number | undefined;
  onResponse: () => void;
};

const getPermissionTitle = (type: string): string => {
  switch (type) {
    case 'protocol':
      return 'Protocol Permission';
    case 'basket':
      return 'Basket Access';
    case 'certificate':
      return 'Certificate Access';
    case 'spending':
      return 'Spending Authorization';
    default:
      return 'Permission Request';
  }
};

const getPermissionDescription = (request: PermissionRequestType): string => {
  switch (request.type) {
    case 'protocol':
      return `An application is requesting permission to use protocol "${request.protocolID?.[1] || 'unknown'}" with security level ${request.protocolID?.[0] || 0}.`;
    case 'basket':
      return `An application is requesting access to basket "${request.basket || 'unknown'}".`;
    case 'certificate':
      return `An application is requesting access to certificate data.`;
    case 'spending':
      return `An application is requesting authorization to spend ${request.spending?.satoshis || 0} satoshis.`;
    default:
      return 'An application is requesting a permission.';
  }
};

const formatSatoshis = (sats: number): string => {
  if (sats >= 100000000) {
    return `${(sats / 100000000).toFixed(8)} BSV`;
  }
  return `${sats.toLocaleString()} satoshis`;
};

export const PermissionRequestPage = (props: PermissionRequestProps) => {
  const { request, onResponse, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const { addSnackbar } = useSnackbar();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const handleGrant = async () => {
    setIsProcessing(true);
    try {
      sendMessage({
        action: 'PERMISSION_RESPONSE',
        requestID: request.requestID,
        granted: true,
      });
      onResponse();
      window.close();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addSnackbar(errorMsg, 'error');
      setIsProcessing(false);
    }
  };

  const handleDeny = async () => {
    setIsProcessing(true);
    sendMessage({
      action: 'PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: false,
    });
    onResponse();
    window.close();
  };

  const handleCancel = async () => {
    sendMessage({
      action: 'PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: false,
    });
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <ConfirmContent>
      <HeaderText theme={theme}>{getPermissionTitle(request.type)}</HeaderText>
      <Text theme={theme} style={{ margin: '0.75rem 0', textAlign: 'center' }}>
        {getPermissionDescription(request)}
      </Text>

      <RequestDetailsContainer theme={theme}>
        <DetailRow>
          <DetailLabel theme={theme}>Origin:</DetailLabel>
          <DetailValue theme={theme}>{request.displayOriginator || request.originator}</DetailValue>
        </DetailRow>

        <Show when={request.type === 'protocol' && !!request.protocolID}>
          <DetailRow>
            <DetailLabel theme={theme}>Protocol:</DetailLabel>
            <DetailValue theme={theme}>{request.protocolID?.[1]}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel theme={theme}>Security:</DetailLabel>
            <DetailValue theme={theme}>Level {request.protocolID?.[0]}</DetailValue>
          </DetailRow>
          <Show when={!!request.counterparty}>
            <DetailRow>
              <DetailLabel theme={theme}>Counterparty:</DetailLabel>
              <DetailValue theme={theme}>{request.counterparty}</DetailValue>
            </DetailRow>
          </Show>
        </Show>

        <Show when={request.type === 'basket' && !!request.basket}>
          <DetailRow>
            <DetailLabel theme={theme}>Basket:</DetailLabel>
            <DetailValue theme={theme}>{request.basket}</DetailValue>
          </DetailRow>
        </Show>

        <Show when={request.type === 'certificate' && !!request.certificate}>
          <DetailRow>
            <DetailLabel theme={theme}>Cert Type:</DetailLabel>
            <DetailValue theme={theme}>{request.certificate?.certType}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel theme={theme}>Fields:</DetailLabel>
            <DetailValue theme={theme}>{request.certificate?.fields.join(', ')}</DetailValue>
          </DetailRow>
        </Show>

        <Show when={request.type === 'spending' && !!request.spending}>
          <DetailRow>
            <DetailLabel theme={theme}>Amount:</DetailLabel>
            <DetailValue theme={theme}>{formatSatoshis(request.spending?.satoshis || 0)}</DetailValue>
          </DetailRow>
          <Show when={!!request.spending?.lineItems?.length}>
            {request.spending?.lineItems?.map((item, i) => (
              <DetailRow key={i}>
                <DetailLabel theme={theme}>{item.type}:</DetailLabel>
                <DetailValue theme={theme}>
                  {item.description} ({formatSatoshis(item.satoshis)})
                </DetailValue>
              </DetailRow>
            ))}
          </Show>
        </Show>

        <Show when={!!request.reason}>
          <DetailRow>
            <DetailLabel theme={theme}>Reason:</DetailLabel>
            <DetailValue theme={theme}>{request.reason}</DetailValue>
          </DetailRow>
        </Show>
      </RequestDetailsContainer>

      <Show when={!!request.privileged}>
        <WarningText theme={theme}>This is a privileged operation</WarningText>
      </Show>

      <FormContainer>
        <Button theme={theme} type="primary" label="Allow" onClick={handleGrant} disabled={isProcessing} />
        <Button theme={theme} type="secondary" label="Deny" onClick={handleDeny} disabled={isProcessing} />
      </FormContainer>
    </ConfirmContent>
  );
};
