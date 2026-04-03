import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../components/Button';
import { HeaderText, Text } from '../components/Reusable';
import { Show } from '../components/Show';
import { SpeedBump } from '../components/SpeedBump';
import { useTheme } from '../hooks/useTheme';
import { useSnackbar } from '../hooks/useSnackbar';
import { WhiteLabelTheme } from '../theme.types';

/** Permission token as returned by WPM — passed through as-is from background */
interface PermissionToken {
  txid: string;
  outputIndex: number;
  originator: string;
  rawOriginator?: string;
  type: 'protocol' | 'basket' | 'spending' | 'certificate';
  // Protocol
  protocol?: string;
  securityLevel?: number;
  counterparty?: string;
  // Basket
  basketName?: string;
  // Spending
  authorizedAmount?: number;
  // Certificate
  certType?: string;
  certFields?: string[];
  verifier?: string;
  // Common
  expiry?: number;
  privileged?: boolean;
  // Full token data (opaque — passed back for revocation)
  [key: string]: unknown;
}

interface OriginatorGroup {
  originator: string;
  permissions: PermissionToken[];
}

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 0.5rem 0;
`;

const OriginatorSection = styled.div<WhiteLabelTheme>`
  width: 90%;
  border-bottom: 1px solid ${({ theme }) => theme.color.global.gray + '30'};
  margin-bottom: 0.25rem;
`;

const OriginatorHeader = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.25rem;
  cursor: pointer;
`;

const OriginatorName = styled.span<WhiteLabelTheme>`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.global.contrast};
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
`;

const CountBadge = styled.span<WhiteLabelTheme>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.625rem;
  background-color: ${({ theme }) => theme.color.global.gray + '40'};
  color: ${({ theme }) => theme.color.global.contrast};
  font-size: 0.65rem;
  font-weight: 600;
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  padding: 0 0.3rem;
  margin-left: 0.35rem;
`;

const RevokeAllBtn = styled.button<WhiteLabelTheme>`
  background: ${({ theme }) => theme.color.component.snackbarError + '20'};
  color: ${({ theme }) => theme.color.component.snackbarError};
  border: 1px solid ${({ theme }) => theme.color.component.snackbarError + '60'};
  border-radius: 0.25rem;
  font-size: 0.65rem;
  font-weight: 600;
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  margin-left: auto;
`;

const PermissionRow = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  padding: 0.4rem 0.5rem;
  border-top: 1px solid ${({ theme }) => theme.color.global.gray + '15'};
`;

const TypeBadge = styled.span<{ $bg: string }>`
  display: inline-block;
  padding: 0.1rem 0.35rem;
  border-radius: 0.2rem;
  font-size: 0.6rem;
  font-weight: 600;
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  color: white;
  background-color: ${(props) => props.$bg};
  margin-right: 0.4rem;
  flex-shrink: 0;
`;

const PermissionDetail = styled.span<WhiteLabelTheme>`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.color.global.contrast};
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RevokeBtn = styled.button<WhiteLabelTheme>`
  background: none;
  border: none;
  color: ${({ theme }) => theme.color.component.snackbarError};
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0 0.25rem;
  flex-shrink: 0;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const LeftGroup = styled.div`
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
`;

const extractDomain = (originator: string): string => {
  try {
    // Handle chrome-extension:// origins
    if (originator.startsWith('chrome-extension://')) {
      return 'This wallet (internal)';
    }
    const url = new URL(originator.includes('://') ? originator : `https://${originator}`);
    return url.host;
  } catch {
    return originator;
  }
};

const tokenKey = (token: PermissionToken): string => {
  return `${token.txid}.${token.outputIndex}`;
};

const typeLabel = (type: PermissionToken['type']): string => {
  switch (type) {
    case 'protocol':
      return 'Protocol';
    case 'basket':
      return 'Data Access';
    case 'spending':
      return 'Spending';
    case 'certificate':
      return 'Certificate';
    default:
      return type;
  }
};

const typeColor = (type: PermissionToken['type']): string => {
  switch (type) {
    case 'protocol':
      return '#5b7fdb';
    case 'basket':
      return '#d4873f';
    case 'spending':
      return '#4db866';
    case 'certificate':
      return '#a855c9';
    default:
      return '#888';
  }
};

/** Human-readable protocol names for known protocols */
const friendlyProtocolName = (name?: string): string => {
  if (!name) return 'Unknown protocol';
  const map: Record<string, string> = {
    '1sat-ordinals': 'Ordinals (key derivation)',
    'message signing': 'Message signing',
    'test encryption': 'Encryption',
    'PERM_TOKEN_ENCRYPTION_PROTOCOL': 'Permission token encryption',
  };
  return map[name] ?? name;
};

/** Human-readable basket names */
const friendlyBasketName = (name?: string): string => {
  if (!name) return 'Unknown data';
  const map: Record<string, string> = {
    'default': 'Payment UTXOs',
    'ordinals': 'Ordinals',
    'bsv21': 'BSV-21 Tokens',
    'locks': 'Locked BSV',
    'admin protocol-permission': 'Protocol permissions (admin)',
    'admin basket-access': 'Basket access (admin)',
    'admin spending-authorization': 'Spending authorizations (admin)',
    'admin certificate-access': 'Certificate access (admin)',
  };
  return map[name] ?? name;
};

const formatSatoshis = (sats: number): string => {
  if (sats >= 100_000_000) return `${(sats / 100_000_000).toFixed(8)} BSV`;
  return `${sats.toLocaleString()} sats`;
};

const formatPermissionDetail = (perm: PermissionToken, spent?: number): string => {
  switch (perm.type) {
    case 'protocol': {
      const name = friendlyProtocolName(perm.protocol);
      const level = perm.securityLevel != null ? ` · Level ${perm.securityLevel}` : '';
      return `${name}${level}`;
    }
    case 'basket':
      return `Can access: ${friendlyBasketName(perm.basketName)}`;
    case 'spending': {
      const limit = perm.authorizedAmount != null
        ? `Up to ${formatSatoshis(perm.authorizedAmount)}`
        : 'Unlimited spending';
      if (spent != null) {
        const remaining = perm.authorizedAmount != null
          ? Math.max(0, perm.authorizedAmount - spent)
          : null;
        const remainingText = remaining != null ? ` · ${formatSatoshis(remaining)} remaining` : '';
        return `${limit} · ${formatSatoshis(spent)} spent this month${remainingText}`;
      }
      return limit;
    }
    case 'certificate': {
      const fields = perm.certFields?.length ? ` (${perm.certFields.join(', ')})` : '';
      return `Certificate access${fields}`;
    }
    default:
      return perm.type;
  }
};

export interface PermissionsManagerProps {
  onBack: () => void;
}

export const PermissionsManager = ({ onBack }: PermissionsManagerProps) => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const [groups, setGroups] = useState<OriginatorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOriginator, setExpandedOriginator] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Set<string>>(new Set());
  const [spentAmounts, setSpentAmounts] = useState<Map<string, number>>(new Map());
  const [showSpeedBump, setShowSpeedBump] = useState(false);
  const [revokeAllTarget, setRevokeAllTarget] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'PERMISSIONS_LIST_ALL' });
      if (response.success) {
        setGroups(response.data?.groups ?? []);
      } else {
        addSnackbar(response.error || 'Failed to load permissions', 'error');
      }
    } catch (error) {
      addSnackbar('Failed to load permissions: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      setLoading(false);
    }
  }, [addSnackbar]);

  useEffect(() => {
    fetchPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleOriginator = async (originator: string) => {
    if (expandedOriginator === originator) {
      setExpandedOriginator(null);
      return;
    }
    setExpandedOriginator(originator);

    const group = groups.find((g) => g.originator === originator);
    if (!group) return;

    const spendingTokens = group.permissions.filter((p) => p.type === 'spending');
    for (const token of spendingTokens) {
      const key = tokenKey(token);
      if (spentAmounts.has(key)) continue;
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'PERMISSIONS_QUERY_SPENT',
          token,
        });
        if (response.success && response.data?.satoshisSpent != null) {
          setSpentAmounts((prev) => new Map(prev).set(key, response.data.satoshisSpent));
        }
      } catch {
        // ignore query failures
      }
    }
  };

  const handleRevokeOne = async (token: PermissionToken) => {
    const key = tokenKey(token);
    setRevoking((prev) => new Set(prev).add(key));
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'PERMISSIONS_REVOKE_ONE',
        token,
      });
      if (response.success) {
        setGroups((prev) =>
          prev
            .map((g) =>
              g.originator === token.originator
                ? { ...g, permissions: g.permissions.filter((p) => tokenKey(p) !== key) }
                : g,
            )
            .filter((g) => g.permissions.length > 0),
        );
        addSnackbar('Permission revoked', 'success');
      } else {
        addSnackbar(response.error || 'Revoke failed', 'error');
      }
    } catch (error) {
      addSnackbar('Revoke failed: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      setRevoking((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const promptRevokeAll = (e: React.MouseEvent, originator: string) => {
    e.stopPropagation();
    setRevokeAllTarget(originator);
    setShowSpeedBump(true);
  };

  const confirmRevokeAll = async () => {
    const originator = revokeAllTarget;
    setShowSpeedBump(false);
    setRevokeAllTarget(null);
    if (!originator) return;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'PERMISSIONS_REVOKE_ALL',
        originator,
      });
      if (response.success) {
        setGroups((prev) => prev.filter((g) => g.originator !== originator));
        if (expandedOriginator === originator) setExpandedOriginator(null);
        addSnackbar(`Revoked ${response.data?.revokedCount ?? 'all'} permissions`, 'success');
      } else {
        addSnackbar(response.error || 'Revoke all failed', 'error');
      }
    } catch (error) {
      addSnackbar('Revoke all failed: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <Text theme={theme}>Loading permissions...</Text>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SpeedBump
        theme={theme}
        message={`Revoke all permissions for ${revokeAllTarget ? extractDomain(revokeAllTarget) : 'this app'}? It will need to request permissions again.`}
        showSpeedBump={showSpeedBump}
        onCancel={() => { setShowSpeedBump(false); setRevokeAllTarget(null); }}
        onConfirm={confirmRevokeAll}
      />
      <HeaderText theme={theme}>Permissions</HeaderText>

      <Show when={groups.length === 0}>
        <Text theme={theme} style={{ marginTop: '2rem' }}>
          No permissions granted
        </Text>
      </Show>

      {groups.map((group) => (
        <OriginatorSection key={group.originator} theme={theme}>
          <OriginatorHeader theme={theme} onClick={() => handleToggleOriginator(group.originator)}>
            <LeftGroup>
              <OriginatorName theme={theme}>{extractDomain(group.originator)}</OriginatorName>
              <CountBadge theme={theme}>{group.permissions.length}</CountBadge>
            </LeftGroup>
            <RevokeAllBtn theme={theme} onClick={(e) => promptRevokeAll(e, group.originator)}>
              Revoke All
            </RevokeAllBtn>
          </OriginatorHeader>

          <Show when={expandedOriginator === group.originator}>
            {group.permissions.map((perm) => {
              const key = tokenKey(perm);
              return (
                <PermissionRow key={key} theme={theme}>
                  <TypeBadge $bg={typeColor(perm.type)}>
                    {typeLabel(perm.type)}
                  </TypeBadge>
                  <PermissionDetail theme={theme}>
                    {formatPermissionDetail(perm, spentAmounts.get(key))}
                  </PermissionDetail>
                  <RevokeBtn theme={theme} onClick={() => handleRevokeOne(perm)} disabled={revoking.has(key)}>
                    ✕
                  </RevokeBtn>
                </PermissionRow>
              );
            })}
          </Show>
        </OriginatorSection>
      ))}

      <Button theme={theme} type="secondary" label="Go back" onClick={onBack} style={{ marginTop: '0.5rem' }} />
    </PageContainer>
  );
};
