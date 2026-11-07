import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useTheme } from '../hooks/useTheme';
import { useSnackbar } from '../hooks/useSnackbar';
import { useServiceContext } from '../hooks/useServiceContext';
import { chainOf, colorOverlayDefaultOf } from '../utils/constants';
import { isColorAssetId, normalizeOverlayOrigin } from '../services/colorOverlay';
import type { ChromeStorageObject, ColorOverlayOverride } from '../services/types/chromeStorage.types';

const shortId = (id: string) => (id.length > 24 ? `${id.slice(0, 10)}…${id.slice(-8)}` : id);

/**
 * Settings > Token overlays: the 1Color overlay each token uses on this
 * account's chain. A token without an override uses the chain default.
 */
export const TokenOverlays = () => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService } = useServiceContext();
  const defaultOrigin = colorOverlayDefaultOf(chainOf(chromeStorageService.getNetwork()));
  const [overrides, setOverrides] = useState<ColorOverlayOverride[]>(
    () => chromeStorageService.getCurrentAccountObject().account?.settings?.colorOverlays ?? [],
  );
  const [assetId, setAssetId] = useState('');
  const [origin, setOrigin] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (next: ColorOverlayOverride[]) => {
    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (!account || !selectedAccount) return false;
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccount]: { ...account, settings: { ...account.settings, colorOverlays: next } },
    };
    setSaving(true);
    try {
      await chromeStorageService.updateNested('accounts', update);
      await chromeStorageService.getAndSetStorage();
      setOverrides(next);
      return true;
    } catch (err) {
      addSnackbar(err instanceof Error ? err.message : 'Could not save token overlays', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const id = assetId.trim().toLowerCase();
    if (!isColorAssetId(id)) {
      addSnackbar('Token id must be <txid>_<vout>', 'error');
      return;
    }
    const normalized = normalizeOverlayOrigin(origin);
    if (!normalized) {
      addSnackbar('Overlay must be an https URL', 'error');
      return;
    }
    const next = [...overrides.filter((o) => o.assetId !== id), { assetId: id, origin: normalized }];
    if (await save(next)) {
      setAssetId('');
      setOrigin('');
    }
  };

  const remove = (id: string) => void save(overrides.filter((o) => o.assetId !== id));

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="rounded-xl px-4 py-3 bg-[#17191E]" style={{ border: '1px solid rgba(152,162,179,0.12)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#98A2B3' }}>
          Default overlay
        </p>
        <p className="text-sm font-mono break-all" style={{ color: defaultOrigin ? '#FFFFFF' : '#98A2B3' }}>
          {defaultOrigin ?? 'None on this network. Tokens without an override cannot be sent.'}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: '#98A2B3' }}>
          Per-token overlays
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(152,162,179,0.12)' }}>
          {overrides.length === 0 && (
            <p className="text-xs px-4 py-3 bg-[#17191E]" style={{ color: '#98A2B3' }}>
              No overrides. Every token uses the default overlay.
            </p>
          )}
          {overrides.map((o) => (
            <div key={o.assetId} className="flex items-center justify-between gap-3 px-4 py-3 bg-[#17191E]">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-mono truncate" style={{ color: '#FFFFFF' }} title={o.assetId}>
                  {shortId(o.assetId)}
                </p>
                <p className="text-xs font-mono truncate" style={{ color: '#98A2B3' }} title={o.origin}>
                  {o.origin}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove overlay for ${o.assetId}`}
                disabled={saving}
                onClick={() => remove(o.assetId)}
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer border-none"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}
              >
                <Trash2 size={14} color="#ef4444" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest px-1" style={{ color: '#98A2B3' }}>
          Add an override
        </p>
        <Input
          theme={theme}
          placeholder="Token id (txid_vout)"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          style={{ margin: 0 }}
        />
        <Input
          theme={theme}
          placeholder="Overlay URL (https://…)"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          style={{ margin: 0 }}
        />
        <Button theme={theme} type="primary" label="Add" onClick={() => void add()} loading={saving} />
      </div>
    </div>
  );
};
