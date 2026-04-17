import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Globe, Shield, X } from 'lucide-react';
import { PageLoader } from '../components/PageLoader';
import { Show } from '../components/Show';
import { SpeedBump } from '../components/SpeedBump';
import { useTheme } from '../hooks/useTheme';
import { useSnackbar } from '../hooks/useSnackbar';
import { useServiceContext } from '../hooks/useServiceContext';
import type { WhitelistedApp } from '../inject';
import type { ChromeStorageObject } from '../services/types/chromeStorage.types';

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

/** A domain unified from both whitelist + BRC-100 permission origins. */
interface UnifiedEntry {
  /** Display key (also used as originator for BRC-100 calls) */
  domain: string;
  /** Icon URL from the whitelist, if any */
  icon?: string;
  /** True if this domain is in the local Yours whitelist */
  connected: boolean;
  /** BRC-100 permission tokens for this originator (may be empty) */
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

const tokenKey = (token: PermissionToken): string => `${token.txid}.${token.outputIndex}`;

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

// onBack is consumed by the parent (Settings) header — kept for API stability
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const PermissionsManager = ({ onBack: _onBack }: PermissionsManagerProps) => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService } = useServiceContext();

  const [groups, setGroups] = useState<OriginatorGroup[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Set<string>>(new Set());
  const [spentAmounts, setSpentAmounts] = useState<Map<string, number>>(new Map());
  const [showSpeedBump, setShowSpeedBump] = useState(false);
  const [revokeAllTarget, setRevokeAllTarget] = useState<string | null>(null);
  const [fullyRevokingDomain, setFullyRevokingDomain] = useState<string | null>(null);

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;

  const loadData = useCallback(async () => {
    try {
      // Permissions from service worker
      const response = await chrome.runtime.sendMessage({ action: 'PERMISSIONS_LIST_ALL' });
      if (response.success) {
        setGroups(response.data?.groups ?? []);
      } else {
        addSnackbar(response.error || 'Failed to load permissions', 'error');
      }

      // Whitelist from chrome storage
      await chromeStorageService.getAndSetStorage();
      const { account } = chromeStorageService.getCurrentAccountObject();
      setWhitelist(account?.settings?.whitelist ?? []);
    } catch (error) {
      addSnackbar('Failed to load: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      setLoading(false);
    }
  }, [addSnackbar, chromeStorageService]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge whitelist + permission origins into a single list, keyed by display domain
  const entries: UnifiedEntry[] = useMemo(() => {
    const map = new Map<string, UnifiedEntry>();

    for (const app of whitelist) {
      map.set(app.domain, {
        domain: app.domain,
        icon: app.icon,
        connected: true,
        permissions: [],
      });
    }

    for (const group of groups) {
      const domain = group.originator;
      const existing = map.get(domain);
      if (existing) {
        existing.permissions = group.permissions;
      } else {
        map.set(domain, {
          domain,
          connected: false,
          permissions: group.permissions,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.domain.localeCompare(b.domain));
  }, [whitelist, groups]);

  const handleToggleExpand = async (domain: string) => {
    if (expandedDomain === domain) {
      setExpandedDomain(null);
      return;
    }
    setExpandedDomain(domain);

    // Fetch spent amounts for any spending tokens under this domain
    const entry = entries.find((e) => e.domain === domain);
    if (!entry) return;
    const spendingTokens = entry.permissions.filter((p) => p.type === 'spending');
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
          prev.map((g) =>
            g.originator === token.originator
              ? { ...g, permissions: g.permissions.filter((p) => tokenKey(p) !== key) }
              : g,
          ),
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

  const removeWhitelistEntry = async (domain: string) => {
    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (!account || !selectedAccount) return;
    const newList = (account.settings?.whitelist ?? []).filter((a) => a.domain !== domain);
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccount]: {
        ...account,
        settings: { ...account.settings, whitelist: newList },
      },
    };
    await chromeStorageService.updateNested(key, update);
    setWhitelist(newList);
  };

  const promptRevokeAll = (domain: string) => {
    setRevokeAllTarget(domain);
    setShowSpeedBump(true);
  };

  const confirmRevokeAll = async () => {
    const domain = revokeAllTarget;
    setShowSpeedBump(false);
    setRevokeAllTarget(null);
    if (!domain) return;

    setFullyRevokingDomain(domain);
    try {
      const entry = entries.find((e) => e.domain === domain);
      const hasPermissions = (entry?.permissions.length ?? 0) > 0;

      // 1. Revoke BRC-100 permission tokens (on-chain, affects all wallets with same identity)
      if (hasPermissions) {
        const response = await chrome.runtime.sendMessage({
          action: 'PERMISSIONS_REVOKE_ALL',
          originator: domain,
        });
        if (response.success) {
          setGroups((prev) => prev.filter((g) => g.originator !== domain));
        } else {
          addSnackbar(response.error || 'Revoke failed', 'error');
          return;
        }
      }

      // 2. Remove from local whitelist (this wallet only)
      if (entry?.connected) {
        await removeWhitelistEntry(domain);
      }

      if (expandedDomain === domain) setExpandedDomain(null);
      addSnackbar(`Revoked access for ${extractDomain(domain)}`, 'success');
    } catch (error) {
      addSnackbar('Revoke failed: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      setFullyRevokingDomain(null);
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
    <div className="flex flex-col items-center w-full py-2 px-3 pb-20">
      <SpeedBump
        theme={theme}
        message={`Revoke all access for ${revokeAllTarget ? extractDomain(revokeAllTarget) : 'this app'}? This removes the connection from this wallet and revokes any on-chain permission tokens.`}
        showSpeedBump={showSpeedBump}
        onCancel={() => {
          setShowSpeedBump(false);
          setRevokeAllTarget(null);
        }}
        onConfirm={confirmRevokeAll}
      />

      {/* Empty state */}
      <Show when={entries.length === 0}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-12 gap-3 w-full"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(161,255,139,0.1)' }}
          >
            <Shield size={22} color="#A1FF8B" />
          </div>
          <p className="text-sm" style={{ color: gray }}>
            No apps connected
          </p>
        </motion.div>
      </Show>

      {/* Unified domain cards */}
      <div className="w-full flex flex-col gap-2">
        {entries.map((entry) => {
          const isExpanded = expandedDomain === entry.domain;
          const permissionCount = entry.permissions.length;
          const displayDomain = extractDomain(entry.domain);
          const isFullyRevoking = fullyRevokingDomain === entry.domain;

          return (
            <div
              key={entry.domain}
              className="rounded-xl overflow-hidden"
              style={{ border: `1px solid ${gray}15`, backgroundColor: '#17191E' }}
            >
              {/* Header row */}
              <motion.button
                whileTap={{ scale: 0.99 }}
                onClick={() => handleToggleExpand(entry.domain)}
                className="flex items-center justify-between w-full px-3 py-2.5 cursor-pointer border-0 outline-none text-left bg-transparent"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {entry.icon ? (
                    <img
                      src={entry.icon}
                      alt={displayDomain}
                      className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'rgba(161,255,139,0.1)' }}
                    >
                      <Globe size={14} color="#A1FF8B" />
                    </div>
                  )}

                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-semibold truncate" style={{ color: contrast }}>
                      {displayDomain}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {entry.connected && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
                          style={{ backgroundColor: 'rgba(161,255,139,0.12)', color: '#A1FF8B' }}
                        >
                          <span className="w-1 h-1 rounded-full" style={{ backgroundColor: '#A1FF8B' }} />
                          Connected
                        </span>
                      )}
                      {permissionCount > 0 && (
                        <span className="text-[10px]" style={{ color: gray }}>
                          {permissionCount} permission{permissionCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown size={14} color={gray} />
                </motion.div>
              </motion.button>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    {/* Individual permission rows */}
                    {entry.permissions.map((perm) => {
                      const key = tokenKey(perm);
                      return (
                        <div
                          key={key}
                          className="flex items-start gap-2 px-3 py-2"
                          style={{ borderTop: `1px solid ${gray}12` }}
                        >
                          <span
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white shrink-0 mt-0.5"
                            style={{ backgroundColor: typeColor(perm.type) }}
                          >
                            {typeLabel(perm.type)}
                          </span>
                          <span
                            className="text-xs flex-1 leading-snug break-words"
                            style={{ color: contrast, minWidth: 0 }}
                          >
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

                    {/* No permissions hint */}
                    {entry.permissions.length === 0 && (
                      <div
                        className="px-3 py-2.5 text-[11px]"
                        style={{ borderTop: `1px solid ${gray}12`, color: gray }}
                      >
                        No granular permissions granted yet.
                      </div>
                    )}

                    {/* Revoke All — nested inside the dropdown */}
                    <div className="px-3 py-2.5" style={{ borderTop: `1px solid ${gray}12` }}>
                      <button
                        onClick={() => promptRevokeAll(entry.domain)}
                        disabled={isFullyRevoking}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: 'rgba(239,68,68,0.08)',
                          color: '#ef4444',
                          borderColor: 'rgba(239,68,68,0.3)',
                        }}
                      >
                        <X size={12} />
                        {isFullyRevoking ? 'Revoking...' : 'Revoke All Access'}
                      </button>
                    </div>
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
