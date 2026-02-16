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
import type {
  CounterpartyPermissionRequest as CounterpartyPermissionRequestType,
  CounterpartyPermissions,
} from '@bsv/wallet-toolbox-mobile';

const RequestDetailsContainer = styled.div<WhiteLabelTheme>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  max-height: 16rem;
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

const PermissionRow = styled.label`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.5rem;
  width: 100%;
  margin: 0.25rem 0;
  cursor: pointer;
`;

const PermissionLabel = styled(Text)`
  font-size: 0.75rem;
  margin: 0;
`;

const PermissionDesc = styled(Text)`
  font-size: 0.7rem;
  opacity: 0.7;
  margin: 0;
`;

export type CounterpartyPermissionRequestProps = {
  request: CounterpartyPermissionRequestType;
  popupId: number | undefined;
  onResponse: () => void;
};

export const CounterpartyPermissionRequestPage = (props: CounterpartyPermissionRequestProps) => {
  const { request, onResponse, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const { addSnackbar } = useSnackbar();
  const [isProcessing, setIsProcessing] = useState(false);
  const { permissions } = request;

  const [protocolChecked, setProtocolChecked] = useState<boolean[]>(() => permissions.protocols.map(() => true));

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const buildGranted = (): Partial<CounterpartyPermissions> => {
    const checkedProtocols = permissions.protocols.filter((_, i) => protocolChecked[i]);
    if (checkedProtocols.length === 0) return {};
    return { protocols: checkedProtocols };
  };

  const handleGrant = async () => {
    setIsProcessing(true);
    try {
      sendMessage({
        action: 'COUNTERPARTY_PERMISSION_RESPONSE',
        requestID: request.requestID,
        granted: buildGranted(),
      });
      addSnackbar('Permissions granted', 'success');
      onResponse();
    } catch (error) {
      addSnackbar(error instanceof Error ? error.message : String(error), 'error');
      setIsProcessing(false);
    }
  };

  const handleDeny = async () => {
    setIsProcessing(true);
    sendMessage({
      action: 'COUNTERPARTY_PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: null,
    });
    addSnackbar('Permissions denied', 'info');
    onResponse();
  };

  const handleCancel = async () => {
    sendMessage({
      action: 'COUNTERPARTY_PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: null,
    });
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  const toggleProtocol = (i: number) => setProtocolChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));

  const counterpartyDisplay =
    request.counterpartyLabel ?? `${request.counterparty.slice(0, 8)}...${request.counterparty.slice(-8)}`;

  return (
    <ConfirmContent>
      <HeaderText theme={theme}>Counterparty Permission</HeaderText>
      <Text theme={theme} style={{ margin: '0.5rem 0', textAlign: 'center', fontSize: '0.8rem' }}>
        <strong>{request.originator}</strong> wants to interact with counterparty:
      </Text>

      <RequestDetailsContainer theme={theme}>
        <DetailRow>
          <DetailLabel theme={theme}>Counterparty:</DetailLabel>
          <DetailValue theme={theme}>{counterpartyDisplay}</DetailValue>
        </DetailRow>

        <Show when={!!permissions.description}>
          <DetailRow>
            <DetailLabel theme={theme}>Purpose:</DetailLabel>
            <DetailValue theme={theme}>{permissions.description}</DetailValue>
          </DetailRow>
        </Show>

        <Text theme={theme} style={{ fontSize: '0.8rem', fontWeight: 700, margin: '0.5rem 0 0.25rem 0' }}>
          Protocols
        </Text>
        {permissions.protocols.map((p, i) => (
          <PermissionRow key={`proto-${i}`}>
            <input type="checkbox" checked={protocolChecked[i]} onChange={() => toggleProtocol(i)} />
            <div>
              <PermissionLabel theme={theme}>
                {p.protocolID[1]} (level {p.protocolID[0]})
              </PermissionLabel>
              <PermissionDesc theme={theme}>{p.description}</PermissionDesc>
            </div>
          </PermissionRow>
        ))}
      </RequestDetailsContainer>

      <FormContainer>
        <Button theme={theme} type="primary" label="Allow Selected" onClick={handleGrant} disabled={isProcessing} />
        <Button theme={theme} type="secondary" label="Deny All" onClick={handleDeny} disabled={isProcessing} />
      </FormContainer>
    </ConfirmContent>
  );
};
