import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Shield, X } from 'lucide-react';
import { PageLoader } from '../components/PageLoader';
import { Show } from '../components/Show';
import { SpeedBump } from '../components/SpeedBump';
import { useTheme } from '../hooks/useTheme';
import { useSnackbar } from '../hooks/useSnackbar';

/** Permission token as returned by WPM — passed through as-is from background */
interface PermissionToken {
  txid: string;
  outputIndex: number;
  originator: string;
  rawOriginator?: string;
  type: 'protocol' | 'basket' | 'spending' | 'certificate';
  protocol?: string;
  securityLevel?: number;
  counterparty?: string;
  basketName?: string;
  authorizedAmount?: number;
  certType?: string;
  certFields?: string[];
  verifier?: string;
  expiry?: number;
  privileged?: boolean;
  [key: string]: unknown;
}

interface OriginatorGroup {
  originator: string;
  permissions: PermissionToken[];
}

const extractDomain = (originator: string): string => {
  try {
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

const friendlyProtocolName = (name?: string): string => {
  if (!name) return 'Unknown protocol';
  const map: Record<string, string> = {
    '1sat-ordinals': 'Ordinals (key derivation)',
    'message signing': 'Message signing',
    'test encryption': 'Encryption',
    PERM_TOKEN_ENCRYPTION_PROTOCOL: 'Permission token encryption',
  };
  return map[name] ?? name;
};

const friendlyBasketName = (name?: string): string => {
  if (!name) return 'Unknown data';
  const map: Record<string, string> = {
    default: 'Payment UTXOs',
    ordinals: 'Ordinals',
    bsv21: 'BSV-21 Tokens',
    locks: 'Locked BSV',
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
      const limit =
        perm.authorizedAmount != null ? `Up to ${formatSatoshis(perm.authorizedAmount)}` : 'Unlimited spending';
      if (spent != null) {
        const remaining = perm.authorizedAmount != null ? Math.max(0, perm.authorizedAmount - spent) : null;
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

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;

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
      <div className="flex flex-col items-center w-full py-2">
        <PageLoader theme={theme} message="Loading permissions..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full py-2 px-3">
      <SpeedBump
        theme={theme}
        message={`Revoke all permissions for ${revokeAllTarget ? extractDomain(revokeAllTarget) : 'this app'}? It will need to request permissions again.`}
        showSpeedBump={showSpeedBump}
        onCancel={() => {
          setShowSpeedBump(false);
          setRevokeAllTarget(null);
        }}
        onConfirm={confirmRevokeAll}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Shield size={18} style={{ color: '#A1FF8B' }} />
        <h2 className="text-lg font-bold" style={{ color: contrast }}>
          Permissions
        </h2>
      </div>

      {/* Empty state */}
      <Show when={groups.length === 0}>
        <p className="text-sm mt-8 text-center" style={{ color: gray }}>
          No permissions granted
        </p>
      </Show>

      {/* Permission groups */}
      <div className="w-full flex flex-col gap-2">
        {groups.map((group) => {
          const isExpanded = expandedOriginator === group.originator;
          return (
            <div
              key={group.originator}
              className="rounded-xl overflow-hidden"
              style={{ border: `1px solid ${gray}15`, backgroundColor: '#17191E' }}
            >
              {/* Originator header */}
              <motion.button
                whileTap={{ scale: 0.99 }}
                onClick={() => handleToggleOriginator(group.originator)}
                className="flex items-center justify-between w-full px-3 py-2.5 cursor-pointer border-0 outline-none text-left bg-transparent"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm font-semibold truncate max-w-[140px]" style={{ color: contrast }}>
                    {extractDomain(group.originator)}
                  </span>
                  <span
                    className="inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1.5 text-[10px] font-semibold"
                    style={{ backgroundColor: gray + '30', color: contrast }}
                  >
                    {group.permissions.length}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => promptRevokeAll(e, group.originator)}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer"
                    style={{
                      background: 'rgba(239,68,68,0.1)',
                      color: '#ef4444',
                      borderColor: 'rgba(239,68,68,0.3)',
                    }}
                  >
                    Revoke All
                  </button>
                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={14} color={gray} />
                  </motion.div>
                </div>
              </motion.button>

              {/* Expanded permissions */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    {group.permissions.map((perm) => {
                      const key = tokenKey(perm);
                      return (
                        <div
                          key={key}
                          className="flex items-center px-3 py-2"
                          style={{ borderTop: `1px solid ${gray}12` }}
                        >
                          <span
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white mr-2 shrink-0"
                            style={{ backgroundColor: typeColor(perm.type) }}
                          >
                            {typeLabel(perm.type)}
                          </span>
                          <span className="text-xs flex-1 truncate" style={{ color: contrast }}>
                            {formatPermissionDetail(perm, spentAmounts.get(key))}
                          </span>
                          <button
                            onClick={() => handleRevokeOne(perm)}
                            disabled={revoking.has(key)}
                            className="shrink-0 p-1 rounded-md cursor-pointer border-0 bg-transparent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-500/10 transition-colors"
                          >
                            <X size={14} color="#ef4444" />
                          </button>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};
