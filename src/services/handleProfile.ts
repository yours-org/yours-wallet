import { AuthFetch, ProtoWallet, Utils, type WalletInterface } from '@bsv/sdk';
import * as dagCbor from '@ipld/dag-cbor';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { resolveHandle, type HandleResolution } from '@1sat/client';
import { decodeProfile, encodeProfile } from '@1sat/utils';
import { outpointFromBytes, outpointToBytes } from '@1sat/templates';
import { formatOrdinalOutpoint } from '@1sat/types';
import { formatHandle, type HeldHandle } from './handles';

/**
 * A handle's profile (skein #104): the OpNS profile record, DAG-CBOR
 * `{domain, name?, avatar?}`, signed by the handle's key under this protocol,
 * kept by the holder on their mailbox instance and served by the host inside
 * the BRC-169 resolve answer as `profile: {record, signature}`.
 */
export const PROFILE_PROTOCOL: [1, string] = [1, 'metanet handles profile'];
export const PROFILE_KEY_ID = '1';
const PROFILE_HEAD = 'profile';

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
        const avatar = d.avatar ? outpointFromBytes(d.avatar) : null;
        profile = { name: d.name ?? '', avatar };
      }
    } catch (error) {
      console.error('[handles] served profile not verified', error);
    }
  }
  return { resolution: a, messagebox: a.messagebox, identityKey: a.identityKey, profile };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Write the handle's profile as its owner: the record encoded and signed by
 * the wallet, then sent to the mailbox instance as two admin messages,
 * `objects` with the block and `head` naming it. Resolves once the host
 * serves the new record.
 */
export const setHandleProfile = async (
  wallet: WalletInterface,
  h: HeldHandle,
  messagebox: string,
  profile: HandleProfile,
): Promise<void> => {
  let avatar: number[] | undefined;
  if (profile.avatar) {
    const bytes = outpointToBytes(formatOrdinalOutpoint(profile.avatar));
    if (!bytes) throw new Error(`The avatar is not an outpoint: ${profile.avatar}`);
    avatar = bytes;
  }
  const name = profile.name.trim();
  const record = encodeProfile({ domain: h.domain, ...(name ? { name } : {}), ...(avatar ? { avatar } : {}) });
  const { signature } = await wallet.createSignature({
    protocolID: PROFILE_PROTOCOL,
    keyID: PROFILE_KEY_ID,
    counterparty: 'anyone',
    data: record,
  });
  const block = dagCbor.encode({ profile: Uint8Array.from(record), signature: Uint8Array.from(signature) });
  const cid = CID.createV1(dagCbor.code, await sha256.digest(block));

  const base = messagebox.replace(/\/+$/, '');
  const af = new AuthFetch(wallet);
  // The instance answers signed; the key its answers carry is the recipient of its admin messages.
  const probe = await af.fetch(`${base}/explore`, { method: 'GET' });
  const identity = probe.headers.get('x-bsv-auth-identity-key');
  if (!identity) throw new Error(`${base} gave no signed answer`);
  const recipient = Uint8Array.from(Utils.toArray(identity, 'hex'));

  const send = async (messageBox: string, body: unknown) => {
    const r = await af.fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/cbor' },
      body: dagCbor.encode({ message: { recipient, messageBox, body: dagCbor.encode(body) } }) as unknown as BodyInit,
    });
    if (r.status !== 200) {
      let text = '';
      try {
        const v = dagCbor.decode(new Uint8Array(await r.arrayBuffer())) as { description?: string };
        text = v.description ?? '';
      } catch {
        /* no decodable body */
      }
      throw new Error(`${messageBox}: HTTP ${r.status} ${text}`.trim());
    }
  };
  await send('objects', { records: [{ cid, bytes: block }] });
  await send('head', { name: PROFILE_HEAD, tree: cid });

  const want = Utils.toBase64(record);
  for (let wait = 250; wait < 8000; wait *= 2) {
    const a = await resolveHeld(h);
    if (a.profile?.record === want) return;
    await sleep(wait);
  }
  throw new Error('Saved to your mailbox; the host does not serve it yet. Look again in a moment.');
};
