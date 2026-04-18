import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Server, ChevronDown, ChevronUp, Check, Shield } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { Theme } from '../theme.types';

// ── Types ──────────────────────────────────────────────────────────────────

interface StorageTier {
  name: string;
  storage: string;
  /** Monthly price in satoshis. 0 = free. Set by the server. */
  priceInSats: number;
  description: string;
}

interface StorageProvider {
  id: string;
  name: string;
  url: string;
  description: string;
  freeTier: string;
  paymentAddress: string;
  tiers: StorageTier[];
}

// TODO: Move to a JSON file in the repo so providers can add themselves via PR
const KNOWN_PROVIDERS: StorageProvider[] = [
  {
    id: 'yours',
    name: 'Yours',
    url: 'https://api.1sat.app/1sat/wallet',
    description: 'Default provider backed by the 1Sat network.',
    freeTier: '1 GB free',
    paymentAddress: '1YoursStoragePaymentAddressXXXXXXXXX',
    tiers: [
      { name: 'Free', storage: '1 GB', priceInSats: 0, description: 'Auto-backup included with every wallet' },
      { name: 'Pro', storage: '10 GB', priceInSats: 6_250_000, description: 'For power users with large collections' },
      { name: 'Unlimited', storage: 'Unlimited', priceInSats: 31_250_000, description: 'No storage limits' },
    ],
  },
  {
    id: 'babbage-test',
    name: 'Babbage Test',
    url: 'https://storage-test.babbage.systems/wallet',
    description: 'Babbage test storage node for development and testing.',
    freeTier: '500 MB free',
    paymentAddress: '1BabbageTestStoragePaymentXXXXXXXXX',
    tiers: [
      { name: 'Free', storage: '500 MB', priceInSats: 0, description: 'Development and testing' },
      { name: 'Standard', storage: '5 GB', priceInSats: 3_125_000, description: 'Production workloads' },
      { name: 'Enterprise', storage: '50 GB', priceInSats: 15_625_000, description: 'High-volume applications' },
    ],
  },
];

// ── Props ──────────────────────────────────────────────────────────────────

type Props = {
  theme: Theme;
  existingRemotes: string[];
  /** USD per 1 BSV (e.g. 65.50). Used to convert tier prices to sats. */
  exchangeRate: number;
  onSelectProvider: (url: string) => void;
  onClose: () => void;
  busy?: boolean;
};

function formatTierPrice(sats: number, exchangeRate: number): string {
  if (sats === 0) return 'Free';
  if (!exchangeRate || exchangeRate <= 0) return `${sats.toLocaleString()} sats/mo`;
  const usd = ((sats / 100_000_000) * exchangeRate).toFixed(2);
  return `$${usd}/mo`;
}

// ── Component ──────────────────────────────────────────────────────────────

export const ProviderPicker = ({ theme, existingRemotes, exchangeRate, onSelectProvider, onClose, busy }: Props) => {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<{ providerId: string; tierName: string } | null>(null);
  const [customUrl, setCustomUrl] = useState('');
  const [customError, setCustomError] = useState('');

  const handleCustomAdd = () => {
    const url = customUrl.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      setCustomError('Invalid URL');
      return;
    }
    setCustomError('');
    onSelectProvider(url);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className="w-full max-w-[400px] rounded-t-2xl flex flex-col"
          style={{
            background: '#0D0D0D',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
            maxHeight: '90vh',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
              Add Storage Provider
            </span>
            <button onClick={onClose} className="p-1 border-0 outline-none cursor-pointer bg-transparent">
              <X size={16} style={{ color: '#98A2B3' }} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 py-3 pb-20 space-y-3">
            <p className="text-[10px]" style={{ color: '#98A2B3' }}>
              Choose a provider or enter a custom URL. Providers can be added to the wallet repo via pull request.
            </p>

            {/* Known providers */}
            {KNOWN_PROVIDERS.map((provider) => {
              const alreadyAdded = existingRemotes.includes(provider.url);
              const isExpanded = expandedProvider === provider.id;

              return (
                <div
                  key={provider.id}
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: alreadyAdded ? 'rgba(52,211,153,0.04)' : 'rgba(255,255,255,0.03)',
                    border: alreadyAdded ? '1px solid rgba(52,211,153,0.15)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {/* Provider header — always visible */}
                  <button
                    onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                    className="flex items-center w-full px-4 py-3 text-left border-0 outline-none cursor-pointer bg-transparent"
                  >
                    <Server size={16} style={{ color: alreadyAdded ? '#34D399' : '#98A2B3' }} className="shrink-0" />
                    <div className="ml-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: '#FFFFFF' }}>
                          {provider.name}
                        </span>
                        {alreadyAdded && (
                          <span
                            className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded"
                            style={{ color: '#34D399', background: 'rgba(52,211,153,0.1)' }}
                          >
                            Added
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: '#98A2B3' }}>
                        {provider.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] font-medium" style={{ color: '#34D399' }}>
                        {provider.freeTier}
                      </span>
                      {isExpanded ? (
                        <ChevronUp size={14} style={{ color: '#667085' }} />
                      ) : (
                        <ChevronDown size={14} style={{ color: '#667085' }} />
                      )}
                    </div>
                  </button>

                  {/* Expanded details — tiers + add button */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <p
                            className="text-[9px] uppercase tracking-wider font-semibold pt-2.5 mb-1.5"
                            style={{ color: '#667085' }}
                          >
                            Plans
                          </p>

                          {provider.tiers.map((tier) => {
                            const isSelected =
                              selectedTier?.providerId === provider.id && selectedTier?.tierName === tier.name;
                            return (
                              <button
                                key={tier.name}
                                onClick={() =>
                                  setSelectedTier(isSelected ? null : { providerId: provider.id, tierName: tier.name })
                                }
                                className="flex items-center w-full px-3 py-2.5 rounded-lg border-0 outline-none cursor-pointer text-left"
                                style={{
                                  background: isSelected ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.02)',
                                  border: isSelected
                                    ? '1px solid rgba(52,211,153,0.25)'
                                    : '1px solid rgba(255,255,255,0.04)',
                                }}
                              >
                                {isSelected ? (
                                  <Check size={12} style={{ color: '#34D399' }} className="shrink-0" />
                                ) : (
                                  <Shield
                                    size={12}
                                    style={{ color: tier.priceInSats === 0 ? '#34D399' : '#FDB022' }}
                                    className="shrink-0"
                                  />
                                )}
                                <div className="ml-2 flex-1 min-w-0">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-[11px] font-semibold" style={{ color: '#FFFFFF' }}>
                                      {tier.name}
                                    </span>
                                    <span className="text-[9px]" style={{ color: '#667085' }}>
                                      {tier.storage}
                                    </span>
                                  </div>
                                  <p className="text-[9px]" style={{ color: '#667085' }}>
                                    {tier.description}
                                  </p>
                                </div>
                                <span
                                  className="text-[10px] font-semibold shrink-0 ml-2"
                                  style={{ color: tier.priceInSats === 0 ? '#34D399' : '#FDB022' }}
                                >
                                  {formatTierPrice(tier.priceInSats, exchangeRate)}
                                </span>
                              </button>
                            );
                          })}

                          {/* URL */}
                          <p className="text-[9px] font-mono pt-1" style={{ color: '#475467' }}>
                            {provider.url}
                          </p>

                          {/* Add button — requires tier selection */}
                          {!alreadyAdded && (
                            <Button
                              theme={theme}
                              type="primary"
                              label={
                                busy
                                  ? 'Adding…'
                                  : selectedTier?.providerId === provider.id
                                    ? `Add ${provider.name} — ${selectedTier.tierName}`
                                    : 'Select a plan above'
                              }
                              onClick={
                                busy || selectedTier?.providerId !== provider.id
                                  ? () => {}
                                  : () => onSelectProvider(provider.url)
                              }
                              disabled={selectedTier?.providerId !== provider.id}
                              loading={busy}
                            />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* Custom URL section */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: '#FFFFFF' }}>
                Custom Provider
              </p>
              <p className="text-[9px] mb-2.5" style={{ color: '#98A2B3' }}>
                Enter any URL that implements the storage API
              </p>
              <Input
                theme={theme}
                placeholder="https://your-server.com/storage"
                type="text"
                onChange={(e) => {
                  setCustomUrl(e.target.value);
                  setCustomError('');
                }}
                value={customUrl}
              />
              {customError && (
                <p className="text-[10px] mt-1" style={{ color: '#F97066' }}>
                  {customError}
                </p>
              )}
              <div className="mt-2">
                <Button
                  theme={theme}
                  type="secondary-outline"
                  label={busy ? 'Adding…' : 'Add Custom Remote'}
                  onClick={busy ? () => {} : handleCustomAdd}
                  loading={busy}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
