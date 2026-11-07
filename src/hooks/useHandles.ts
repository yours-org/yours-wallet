import { useCallback, useEffect, useState } from 'react';
import type { WalletInterface } from '@bsv/sdk';
import type { ChromeStorageService } from '../services/ChromeStorage.service';
import { autoDefaultHandle, formatHandle, listHandles, saveDefaultHandle, type HeldHandle } from '../services/handles';
import { loadHandleDetails } from '../services/handleProfile';

/**
 * The BRC-169 handle certificates held in the wallet, with decrypted fields,
 * and the account's default "from" handle. A wallet holding exactly one
 * handle gets it as the default without being asked (`autoDefaultHandle`).
 */
export const useHandles = (wallet: WalletInterface, chromeStorageService: ChromeStorageService) => {
  const [handles, setHandles] = useState<HeldHandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultHandle, setDefault] = useState<string | null>(
    () => chromeStorageService.getCurrentAccountObject().account?.settings.defaultHandle ?? null,
  );

  const setDefaultHandle = useCallback(
    async (handle: string) => {
      setDefault(handle || null);
      await saveDefaultHandle(chromeStorageService, handle);
    },
    [chromeStorageService],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const held = await listHandles(wallet);
      setHandles(held);
      const current = chromeStorageService.getCurrentAccountObject().account?.settings.defaultHandle ?? null;
      const auto = autoDefaultHandle(current, held);
      if (auto) await setDefaultHandle(auto);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [wallet, chromeStorageService, setDefaultHandle]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { handles, loading, error, refresh, defaultHandle, setDefaultHandle };
};

/**
 * The avatar of the default handle's served profile, as an ordinal outpoint
 * (`txid_vout`), or '' while loading, when there is no default, or when the
 * host serves no profile.
 */
export const useHandleAvatar = (handles: HeldHandle[], defaultHandle: string | null): string => {
  const [avatar, setAvatar] = useState('');
  useEffect(() => {
    const held = defaultHandle ? handles.find((h) => formatHandle(h) === defaultHandle) : undefined;
    if (!held) {
      setAvatar('');
      return;
    }
    let cancelled = false;
    loadHandleDetails(held)
      .then((d) => {
        if (!cancelled) setAvatar(d.profile?.avatar ?? '');
      })
      .catch((error) => {
        console.error('[handles] loading the default handle profile failed:', error);
        if (!cancelled) setAvatar('');
      });
    return () => {
      cancelled = true;
    };
  }, [handles, defaultHandle]);
  return avatar;
};
