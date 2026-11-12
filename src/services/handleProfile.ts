import { AuthFetch, ProtoWallet, Utils, type WalletInterface } from '@bsv/sdk';
import { resolveHandle, type HandleResolution } from '@1sat/client';
import { decodeProfile, encodeProfile } from '@1sat/utils';
import { formatOrdinalOutpoint, outpointFromWire, outpointToWire, parseOutpoint } from '@1sat/types';
import { formatHandle, type HeldHandle } from './handles';

/**
 * A handle's profile (skein #104): the OpNS profile record, DAG-CBOR
 * `{domain, name?, avatar?}`, signed by the handle's key under this protocol,
 * posted to the registrar (`POST <origin>/account/profile`, skein-onboard
 * 0.4.0) and served by the host inside the BRC-169 resolve answer as
 * `profile: {record, signature}`.
 */
export const PROFILE_PROTOCOL: [1, string] = [1, 'metanet handles profile'];
export const PROFILE_KEY_ID = '1';

/** What a skein router answers at every host name it serves: `{origin, domain}`. */
export const SKEIN_HOST_PATH = '/.well-known/skein-host';

/** The profile as edited: `avatar` is an outpoint, `txid_vout`. */
export type HandleProfile = { name: string; avatar: string | null };

export type HandleDetails = {
  resolution: HandleResolution;
  messagebox: string;
  identityKey: string;
  /** The holder-signed profile, when the host serves one that verifies for this handle. */
  profile: HandleProfile | null;
};

type ServedResolution = HandleResolution & {
  profile?: { record?: string; signature?: string };
};

/** `txid_vout` or `txid.vout` → its 36 bytes (txid internal order ‖ vout LE); throws on anything else. */
export const avatarBytes = (s: string): number[] => {
  try {
    const { txid, vout } = parseOutpoint(formatOrdinalOutpoint(s.trim()));
    return Array.from(outpointToWire(txid, vout));
  } catch {
    throw new Error(`The avatar is not an outpoint: ${s}`);
  }
};

/** 36 outpoint bytes → `txid_vout`. */
const outpointText = (bytes: number[] | Uint8Array): string => {
  const { txid, vout } = outpointFromWire(bytes);
  return `${txid}_${vout}`;
};

const resolveHeld = async (h: HeldHandle): Promise<ServedResolution> =>
  (await resolveHandle(formatHandle(h))) as ServedResolution;

/** Resolve a held handle and decode the signed profile the host serves for it. */
export const loadHandleDetails = async (h: HeldHandle): Promise<HandleDetails> => {
  const a = await resolveHeld(h);
  let profile: HandleProfile | null = null;
  const p = a.profile;
  if (p && typeof p.record === 'string' && typeof p.signature === 'string') {
    try {
      const data = Utils.toArray(p.record, 'base64');
      const { valid } = await new ProtoWallet('anyone').verifySignature({
        protocolID: PROFILE_PROTOCOL,
        keyID: PROFILE_KEY_ID,
        counterparty: a.identityKey,
        data,
        signature: Utils.toArray(p.signature, 'hex'),
      });
      const d = decodeProfile(data);
      if (valid && d.domain === h.domain) {
        const avatar = d.avatar ? outpointText(d.avatar) : null;
        profile = { name: d.name ?? '', avatar };
      }
    } catch (error) {
      console.error('[handles] served profile not verified', error);
    }
  }
  return { resolution: a, messagebox: a.messagebox, identityKey: a.identityKey, profile };
};

const registrars = new Map<string, Promise<string>>();

/**
 * The registrar origin for a handle domain: the `origin` the skein router
 * answers at `https://<domain>/.well-known/skein-host`, read once per domain
 * (a failed read is not kept).
 */
export const registrarOrigin = (domain: string, fetchFn: typeof fetch = fetch): Promise<string> => {
  const key = domain.toLowerCase();
  let p = registrars.get(key);
  if (!p) {
    const at = `https://${key}${SKEIN_HOST_PATH}`;
    p = (async () => {
      const r = await fetchFn(at, { headers: { accept: 'application/json' } });
      let body: { origin?: unknown } | undefined;
      try {
        body = await r.json();
      } catch {
        /* the status says it */
      }
      if (r.status !== 200 || typeof body?.origin !== 'string') {
        throw new Error(`${at}: not a skein host (HTTP ${r.status})`);
      }
      return new URL(body.origin).origin;
    })();
    p.catch(() => registrars.delete(key));
    registrars.set(key, p);
  }
  return p;
};

/** The body of `POST /account/profile`: the record and the wallet's signature over its bytes. */
export const profileRequestBody = async (
  wallet: Pick<WalletInterface, 'createSignature'>,
  h: Pick<HeldHandle, 'handle' | 'domain'>,
  profile: HandleProfile,
): Promise<{ handle: string; record: string; signature: string }> => {
  const avatar = profile.avatar ? avatarBytes(profile.avatar) : undefined;
  const name = profile.name.trim();
  const record = encodeProfile({ domain: h.domain, ...(name ? { name } : {}), ...(avatar ? { avatar } : {}) });
  const { signature } = await wallet.createSignature({
    protocolID: PROFILE_PROTOCOL,
    keyID: PROFILE_KEY_ID,
    counterparty: 'anyone',
    data: record,
  });
  return { handle: h.handle, record: Utils.toBase64(record), signature: Utils.toHex(signature) };
};

/** What the profile POST goes over: the wallet's BRC-104 session (@bsv/sdk `AuthFetch`). */
export type SessionFetch = {
  fetch(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<Response>;
};

const sessions = new WeakMap<WalletInterface, SessionFetch>();
const sessionFor = (wallet: WalletInterface): SessionFetch => {
  let af = sessions.get(wallet);
  if (!af) sessions.set(wallet, (af = new AuthFetch(wallet) as unknown as SessionFetch));
  return af;
};

/**
 * Write the handle's profile as its owner: the record encoded and signed by
 * the wallet, posted to `POST <registrar origin>/account/profile` over the
 * wallet's BRC-104 session. A refusal is thrown with the host's own `error`
 * text.
 */
export const setHandleProfile = async (
  wallet: WalletInterface,
  h: HeldHandle,
  profile: HandleProfile,
  deps: { session?: SessionFetch; fetch?: typeof fetch } = {},
): Promise<void> => {
  const body = await profileRequestBody(wallet, h, profile);
  const origin = await registrarOrigin(h.domain, deps.fetch);
  const r = await (deps.session ?? sessionFor(wallet)).fetch(`${origin}/account/profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let v: { error?: unknown; profile?: { record?: string } } = {};
  try {
    v = await r.json();
  } catch {
    /* the status says it */
  }
  if (r.status !== 200) throw new Error(typeof v?.error === 'string' ? v.error : `HTTP ${r.status}`);
  if (v.profile?.record !== body.record) throw new Error('The host answered without the profile you signed.');
};
