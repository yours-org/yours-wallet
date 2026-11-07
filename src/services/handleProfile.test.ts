import { describe, expect, test } from 'bun:test';
import { PrivateKey, ProtoWallet, Utils, type WalletInterface } from '@bsv/sdk';
import { decodeProfile } from '@1sat/utils';
import {
  PROFILE_KEY_ID,
  PROFILE_PROTOCOL,
  profileRequestBody,
  registrarOrigin,
  setHandleProfile,
  type SessionFetch,
} from './handleProfile';
import type { HeldHandle } from './handles';

const TXID = 'ab'.repeat(32);
const held = (domain: string): HeldHandle => ({
  handle: 'alice',
  domain,
  certifier: '02'.padEnd(66, '1'),
  serialNumber: 's',
});

const wallet = () => new ProtoWallet(PrivateKey.fromRandom()) as unknown as WalletInterface;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch answering /.well-known/skein-host with `origin`, recording the URLs asked. */
const hostFetch = (origin: string) => {
  const urls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return json(200, { origin, domain: 'x' });
  }) as typeof fetch;
  return { fn, urls };
};

/** A session that records the POST and answers with `answer(body)`. */
const session = (answer: (body: { record: string }) => Response) => {
  const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
  const s: SessionFetch = {
    fetch: async (url, init) => {
      calls.push({ url, init });
      return answer(JSON.parse(init.body));
    },
  };
  return { s, calls };
};

describe('profileRequestBody', () => {
  test('record = base64 DAG-CBOR {domain, name, avatar}; signature verifies for the wallet key', async () => {
    const w = wallet();
    const body = await profileRequestBody(w, held('testnet.1sat.app'), { name: ' Alice ', avatar: `${TXID}_2` });
    expect(body.handle).toBe('alice');
    const bytes = Utils.toArray(body.record, 'base64');
    const d = decodeProfile(bytes);
    expect(d.domain).toBe('testnet.1sat.app');
    expect(d.name).toBe('Alice');
    expect(d.avatar?.length).toBe(36);
    const { publicKey } = await w.getPublicKey({ identityKey: true });
    const { valid } = await new ProtoWallet('anyone').verifySignature({
      protocolID: PROFILE_PROTOCOL,
      keyID: PROFILE_KEY_ID,
      counterparty: publicKey,
      data: bytes,
      signature: Utils.toArray(body.signature, 'hex'),
    });
    expect(valid).toBe(true);
  });

  test('no name, no avatar: the record holds the domain only', async () => {
    const body = await profileRequestBody(wallet(), held('a.example'), { name: '  ', avatar: null });
    const d = decodeProfile(Utils.toArray(body.record, 'base64'));
    expect(d).toEqual({ domain: 'a.example' });
  });

  test('an avatar that is not an outpoint throws', async () => {
    await expect(profileRequestBody(wallet(), held('a.example'), { name: '', avatar: 'nope' })).rejects.toThrow(
      'not an outpoint',
    );
  });
});

describe('setHandleProfile', () => {
  test('POSTs the body as JSON to <skein-host origin>/account/profile', async () => {
    const hf = hostFetch('https://router.b.example/some/path');
    const { s, calls } = session((b) => json(200, { handle: 'alice', profile: { record: b.record } }));
    await setHandleProfile(wallet(), held('b.example'), { name: 'A', avatar: null }, { session: s, fetch: hf.fn });
    expect(hf.urls).toEqual(['https://b.example/.well-known/skein-host']);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('https://router.b.example/account/profile');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['content-type']).toBe('application/json');
    expect(Object.keys(JSON.parse(calls[0].init.body)).sort()).toEqual(['handle', 'record', 'signature']);
  });

  test("a refusal throws the host's error text", async () => {
    const hf = hostFetch('https://c.example');
    const { s } = session(() => json(401, { error: 'signature is not the handle key' }));
    await expect(
      setHandleProfile(wallet(), held('c.example'), { name: 'A', avatar: null }, { session: s, fetch: hf.fn }),
    ).rejects.toThrow('signature is not the handle key');
  });
});

describe('registrarOrigin', () => {
  test('read once per domain', async () => {
    const hf = hostFetch('https://d-router.example');
    expect(await registrarOrigin('d.example', hf.fn)).toBe('https://d-router.example');
    expect(await registrarOrigin('D.example', hf.fn)).toBe('https://d-router.example');
    expect(hf.urls.length).toBe(1);
  });

  test('not a skein host: throws, and is asked again next time', async () => {
    let n = 0;
    const fn = (async () => {
      n++;
      return json(404, {});
    }) as unknown as typeof fetch;
    await expect(registrarOrigin('e.example', fn)).rejects.toThrow('not a skein host');
    await expect(registrarOrigin('e.example', fn)).rejects.toThrow('not a skein host');
    expect(n).toBe(2);
  });
});
