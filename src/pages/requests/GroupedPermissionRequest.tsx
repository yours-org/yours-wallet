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
import type { GroupedPermissionRequest as GroupedPermissionRequestType, GroupedPermissions } from '@bsv/wallet-toolbox-mobile';

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

const SectionLabel = styled(Text)`
  font-size: 0.8rem;
  font-weight: 700;
  margin: 0.5rem 0 0.25rem 0;
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

export type GroupedPermissionRequestProps = {
  request: GroupedPermissionRequestType;
  popupId: number | undefined;
  onResponse: () => void;
};

export const GroupedPermissionRequestPage = (props: GroupedPermissionRequestProps) => {
  const { request, onResponse, popupId } = props;
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  const { addSnackbar } = useSnackbar();
  const [isProcessing, setIsProcessing] = useState(false);
  const { permissions } = request;

  // Track which items are checked — all on by default
  const [protocolChecked, setProtocolChecked] = useState<boolean[]>(
    () => (permissions.protocolPermissions ?? []).map(() => true),
  );
  const [basketChecked, setBasketChecked] = useState<boolean[]>(
    () => (permissions.basketAccess ?? []).map(() => true),
  );
  const [certChecked, setCertChecked] = useState<boolean[]>(
    () => (permissions.certificateAccess ?? []).map(() => true),
  );
  const [spendingChecked, setSpendingChecked] = useState(!!permissions.spendingAuthorization);

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const buildGranted = (): Partial<GroupedPermissions> => {
    const granted: Partial<GroupedPermissions> = {};
    const checkedProtocols = (permissions.protocolPermissions ?? []).filter((_, i) => protocolChecked[i]);
    if (checkedProtocols.length > 0) granted.protocolPermissions = checkedProtocols;
    const checkedBaskets = (permissions.basketAccess ?? []).filter((_, i) => basketChecked[i]);
    if (checkedBaskets.length > 0) granted.basketAccess = checkedBaskets;
    const checkedCerts = (permissions.certificateAccess ?? []).filter((_, i) => certChecked[i]);
    if (checkedCerts.length > 0) granted.certificateAccess = checkedCerts;
    if (spendingChecked && permissions.spendingAuthorization) {
      granted.spendingAuthorization = permissions.spendingAuthorization;
    }
    return granted;
  };

  const handleGrant = async () => {
    setIsProcessing(true);
    try {
      sendMessage({
        action: 'GROUPED_PERMISSION_RESPONSE',
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
      action: 'GROUPED_PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: null,
    });
    addSnackbar('Permissions denied', 'info');
    onResponse();
  };

  const handleCancel = async () => {
    sendMessage({
      action: 'GROUPED_PERMISSION_RESPONSE',
      requestID: request.requestID,
      granted: null,
    });
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  const toggleProtocol = (i: number) => setProtocolChecked(prev => prev.map((v, j) => j === i ? !v : v));
  const toggleBasket = (i: number) => setBasketChecked(prev => prev.map((v, j) => j === i ? !v : v));
  const toggleCert = (i: number) => setCertChecked(prev => prev.map((v, j) => j === i ? !v : v));

  return (
    <ConfirmContent>
      <HeaderText theme={theme}>Permission Request</HeaderText>
      <Text theme={theme} style={{ margin: '0.5rem 0', textAlign: 'center', fontSize: '0.8rem' }}>
        <strong>{request.originator}</strong> is requesting the following permissions:
      </Text>

      <Show when={!!permissions.description}>
        <Text theme={theme} style={{ fontSize: '0.75rem', opacity: 0.7, margin: '0 0 0.5rem 0' }}>
          {permissions.description}
        </Text>
      </Show>

      <RequestDetailsContainer theme={theme}>
        <Show when={!!permissions.protocolPermissions?.length}>
          <SectionLabel theme={theme}>Protocols</SectionLabel>
          {permissions.protocolPermissions?.map((p, i) => (
            <PermissionRow key={`proto-${i}`}>
              <input type="checkbox" checked={protocolChecked[i]} onChange={() => toggleProtocol(i)} />
              <div>
                <PermissionLabel theme={theme}>
                  {p.protocolID[1]} (level {p.protocolID[0]})
                  {p.counterparty ? ` — ${p.counterparty.slice(0, 10)}...` : ''}
                </PermissionLabel>
                <PermissionDesc theme={theme}>{p.description}</PermissionDesc>
              </div>
            </PermissionRow>
          ))}
        </Show>

        <Show when={!!permissions.basketAccess?.length}>
          <SectionLabel theme={theme}>Baskets</SectionLabel>
          {permissions.basketAccess?.map((b, i) => (
            <PermissionRow key={`basket-${i}`}>
              <input type="checkbox" checked={basketChecked[i]} onChange={() => toggleBasket(i)} />
              <div>
                <PermissionLabel theme={theme}>{b.basket}</PermissionLabel>
                <PermissionDesc theme={theme}>{b.description}</PermissionDesc>
              </div>
            </PermissionRow>
          ))}
        </Show>

        <Show when={!!permissions.certificateAccess?.length}>
          <SectionLabel theme={theme}>Certificates</SectionLabel>
          {permissions.certificateAccess?.map((c, i) => (
            <PermissionRow key={`cert-${i}`}>
              <input type="checkbox" checked={certChecked[i]} onChange={() => toggleCert(i)} />
              <div>
                <PermissionLabel theme={theme}>{c.type}</PermissionLabel>
                <PermissionDesc theme={theme}>{c.description} — fields: {c.fields.join(', ')}</PermissionDesc>
              </div>
            </PermissionRow>
          ))}
        </Show>

        <Show when={!!permissions.spendingAuthorization}>
          <SectionLabel theme={theme}>Spending</SectionLabel>
          <PermissionRow>
            <input type="checkbox" checked={spendingChecked} onChange={() => setSpendingChecked(!spendingChecked)} />
            <div>
              <PermissionLabel theme={theme}>
                {(permissions.spendingAuthorization?.amount ?? 0).toLocaleString()} satoshis
              </PermissionLabel>
              <PermissionDesc theme={theme}>{permissions.spendingAuthorization?.description}</PermissionDesc>
            </div>
          </PermissionRow>
        </Show>
      </RequestDetailsContainer>

      <FormContainer>
        <Button theme={theme} type="primary" label="Allow Selected" onClick={handleGrant} disabled={isProcessing} />
        <Button theme={theme} type="secondary" label="Deny All" onClick={handleDeny} disabled={isProcessing} />
      </FormContainer>
    </ConfirmContent>
  );
};
