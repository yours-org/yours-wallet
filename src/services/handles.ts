import { MasterCertificate, type WalletInterface } from '@bsv/sdk';
import { HANDLE_CERT_TYPE } from '@1sat/types';
import { resolveHandle, type HandleResolution } from '@1sat/client';
import { syncMetanetInbox, type OneSatContext } from '@1sat/actions';

/** A BRC-169 handle certificate held in the wallet, with its fields decrypted. */
export type HeldHandle = {
  handle: string;
  domain: string;
  certifier: string;
  serialNumber: string;
};

/** `@handle@domain`, the form the default "from" handle setting stores. */
export const formatHandle = (h: Pick<HeldHandle, 'handle' | 'domain'>): string => `@${h.handle}@${h.domain}`;

/**
 * List the BRC-169 handle certificates held in the wallet and decrypt their
 * `handle` and `domain` fields (BRC-52). `listCertificates` returns the
 * master keyring the certifier encrypted for this wallet, so the wallet
 * decrypts it with the certifier as counterparty. A certificate whose fields
 * cannot be decrypted is logged and left out.
 */
export const listHandles = async (wallet: WalletInterface): Promise<HeldHandle[]> => {
  const { certificates } = await wallet.listCertificates({ types: [HANDLE_CERT_TYPE], certifiers: [] });
  const handles: HeldHandle[] = [];
  for (const cert of certificates) {
    try {
      const fields = await MasterCertificate.decryptFields(wallet, cert.keyring ?? {}, cert.fields, cert.certifier);
      handles.push({
        handle: fields.handle,
        domain: fields.domain,
        certifier: cert.certifier,
        serialNumber: cert.serialNumber,
      });
    } catch (error) {
      console.error('[handles] could not decrypt handle certificate', cert.serialNumber, error);
    }
  }
  return handles;
};

type CachedResolution = { resolution: HandleResolution; expiresAt: number };

/**
 * Collects the wallet's `metanet_inbox` at the messagebox of every handle it
 * holds. Each domain's own-handle resolution is cached in memory for its
 * `ttl` seconds (BRC-169 §5.4; ttl 0 is never cached).
 */
export const createHandleInboxSync = (ctx: OneSatContext) => {
  const cache = new Map<string, CachedResolution>();
  let running = false;

  const resolveOwn = async (handle: string): Promise<HandleResolution> => {
    const cached = cache.get(handle);
    if (cached && Date.now() < cached.expiresAt) return cached.resolution;
    cache.delete(handle);
    const resolution = await resolveHandle(handle);
    if (resolution.ttl > 0) {
      cache.set(handle, { resolution, expiresAt: Date.now() + resolution.ttl * 1000 });
    }
    return resolution;
  };

  return async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const handles = await listHandles(ctx.wallet);
      const byDomain = new Map<string, HeldHandle>();
      for (const h of handles) {
        if (!byDomain.has(h.domain)) byDomain.set(h.domain, h);
      }

      const messageboxes = new Set<string>();
      for (const [domain, h] of byDomain) {
        try {
          const resolution = await resolveOwn(formatHandle(h));
          messageboxes.add(resolution.messagebox);
        } catch (error) {
          console.error(`[handles] resolving own handle at ${domain} failed:`, error);
        }
      }

      for (const messageboxUrl of messageboxes) {
        try {
          const result = await syncMetanetInbox.execute(ctx, { messageboxUrl });
          if (result.error) {
            console.error(`[handles] metanet inbox sync at ${messageboxUrl} failed:`, result.error);
          } else if (result.received.length > 0 || result.skipped.length > 0) {
            console.log(`[handles] metanet inbox sync at ${messageboxUrl}:`, result);
          }
        } catch (error) {
          console.error(`[handles] metanet inbox sync at ${messageboxUrl} failed:`, error);
        }
      }
    } catch (error) {
      console.error('[handles] listing handle certificates failed:', error);
    } finally {
      running = false;
    }
  };
};
