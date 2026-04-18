import { useCallback, useEffect, useState } from 'react';
import {
  computeBapId,
  resolveBapId,
  updateProfile,
  getProfile,
  inscribe,
  type ProfileResponse,
  type IdentityResponse,
} from '@1sat/actions';
import type { OneSatContext } from '@1sat/actions';
import type { ChromeStorageService } from '../services/ChromeStorage.service';
import type { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { HOSTED_YOURS_IMAGE } from '../utils/constants';

/**
 * Resolve a 1sat:// protocol URI to a renderable HTTPS URL.
 * Falls back to returning the input if it's already an HTTP URL or empty.
 */
export function resolveImageUrl(uri: string, apiContext: OneSatContext): string {
  if (!uri) return '';
  if (uri.startsWith('1sat://')) {
    const outpoint = uri.slice(7).replace('.', '_');
    return apiContext.services!.ordfs.getContentUrl(outpoint);
  }
  return uri;
}

export type IdentityProfile = {
  name: string;
  image: string;
  description: string;
};

export type IdentityState = {
  /** Deterministic BAP ID (always available) */
  bapId: string | null;
  /** Whether the identity has been published on-chain */
  isPublished: boolean;
  /** On-chain profile data */
  profile: IdentityProfile;
  /** Loading state */
  loading: boolean;
  /** Error from last operation */
  error: string | null;
};

/** Scale an image to fit within maxSize, preserving aspect ratio. No cropping. */
async function resizeImage(
  file: File,
  maxSize: number,
  quality: number,
): Promise<{ base64: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  const buffer = await blob.arrayBuffer();
  const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
  return { base64, mimeType: 'image/jpeg' };
}

const DEFAULT_PROFILE: IdentityProfile = {
  name: '',
  image: '',
  description: '',
};

export const useIdentity = (apiContext: OneSatContext, chromeStorageService?: ChromeStorageService) => {
  // Seed initial profile from chrome storage cache so the avatar URL is
  // available on the very first render — avoids the image "pop-in" effect.
  const cachedProfile = (() => {
    if (!chromeStorageService) return DEFAULT_PROFILE;
    const { account } = chromeStorageService.getCurrentAccountObject();
    const sp = account?.settings?.socialProfile;
    if (!sp?.avatar || sp.avatar === HOSTED_YOURS_IMAGE) return DEFAULT_PROFILE;
    return { name: sp.displayName || '', image: sp.avatar, description: '' };
  })();

  const [state, setState] = useState<IdentityState>({
    bapId: null,
    isPublished: !!cachedProfile.image,
    profile: cachedProfile,
    loading: true,
    error: null,
  });

  const cacheToStorage = useCallback(
    (profile: IdentityProfile) => {
      if (!chromeStorageService) return;
      const { account } = chromeStorageService.getCurrentAccountObject();
      if (!account) return;
      const key: keyof ChromeStorageObject = 'accounts';
      const update: Partial<ChromeStorageObject['accounts']> = {
        [account.addresses.identityAddress]: {
          ...account,
          settings: {
            ...account.settings,
            socialProfile: {
              displayName: profile.name,
              avatar: profile.image,
            },
          },
        },
      };
      chromeStorageService.updateNested(key, update);
    },
    [chromeStorageService],
  );

  const loadIdentity = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [bapId, resolvedId] = await Promise.all([computeBapId(apiContext), resolveBapId(apiContext)]);

      const isPublished = resolvedId !== null;
      let profile = DEFAULT_PROFILE;

      if (isPublished) {
        const res: ProfileResponse = await getProfile.execute(apiContext, {});
        if (res.profile) {
          profile = {
            name: (res.profile.name as string) || DEFAULT_PROFILE.name,
            image: (res.profile.image as string) || DEFAULT_PROFILE.image,
            description: (res.profile.description as string) || DEFAULT_PROFILE.description,
          };
        }
      }

      if (isPublished) cacheToStorage(profile);
      setState({ bapId, isPublished, profile, loading: false, error: null });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [apiContext, cacheToStorage]);

  useEffect(() => {
    loadIdentity();
  }, [loadIdentity]);

  /**
   * Resize an image file and return the base64 + estimated byte size
   * without inscribing. Use this to show cost before committing.
   */
  const prepareAvatar = useCallback(async (file: File) => {
    const { base64, mimeType } = await resizeImage(file, 256, 0.85);
    // base64 string → decoded byte count
    const byteSize = Math.ceil((base64.length * 3) / 4);
    return { base64, mimeType, byteSize };
  }, []);

  /** Inscribe a pre-prepared avatar on-chain and return its ORDFS URL. */
  const inscribeAvatar = useCallback(
    async (base64: string, mimeType: string): Promise<{ url?: string; error?: string }> => {
      try {
        const res = await inscribe.execute(apiContext, {
          base64Content: base64,
          contentType: mimeType,
          map: { app: 'yours-wallet', type: 'avatar' },
        });
        if (res.error || !res.txid) {
          return { error: res.error || 'Inscription failed' };
        }
        return { url: `1sat://${res.txid}.0` };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    [apiContext],
  );

  const saveProfile = useCallback(
    async (profile: IdentityProfile): Promise<IdentityResponse> => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const schemaProfile: Record<string, unknown> = {
          '@type': 'Person',
          name: profile.name,
        };
        if (profile.image) schemaProfile.image = profile.image;
        if (profile.description) schemaProfile.description = profile.description;

        const res = await updateProfile.execute(apiContext, { profile: schemaProfile });
        if (res.error) {
          setState((s) => ({ ...s, loading: false, error: res.error! }));
          return res;
        }
        await loadIdentity();
        return res;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, loading: false, error }));
        return { error };
      }
    },
    [apiContext, loadIdentity],
  );

  return {
    ...state,
    prepareAvatar,
    inscribeAvatar,
    saveProfile,
    reload: loadIdentity,
  };
};
