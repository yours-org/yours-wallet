import { describe, expect, test } from 'bun:test';
import { LockingScript, Transaction } from '@bsv/sdk';
import { createColorOverlayProvider, NoColorOverlayError, normalizeOverlayOrigin } from './colorOverlay';
import type { ColorOverlayOverride } from './types/chromeStorage.types';

const ASSET_A = `${'a'.repeat(64)}_0`;
const ASSET_B = `${'b'.repeat(64)}_1`;
const DEFAULT = 'https://swap.skein.nexus';
const OTHER = 'https://overlay.example.com';

type Call = { url: string; method?: string; headers: Record<string, string>; body: unknown };

/** A fake fetch that records each request and answers JSON. */
const fakeFetch = (answer: unknown = { type: 'output-list', outputs: [] }) => {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body;
    calls.push({
      url: String(input),
      method: init?.method,
      headers: Object.fromEntries(new Headers(init?.headers as HeadersInit).entries()),
      body: body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : body,
    });
    return new Response(JSON.stringify(answer), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fn, calls };
};

const provider = (overrides: ColorOverlayOverride[], defaultOrigin: string | undefined, fetchFn: typeof fetch) =>
  createColorOverlayProvider({ defaultOrigin, getOverrides: async () => overrides, fetch: fetchFn });

describe('origin resolution', () => {
  test('a per-token override wins over the default', async () => {
    const p = provider([{ assetId: ASSET_A, origin: OTHER }], DEFAULT, fakeFetch().fn);
    expect(await p.resolveOrigin(ASSET_A)).toBe(OTHER);
  });

  test('a token without an override uses the chain default', async () => {
    const p = provider([{ assetId: ASSET_A, origin: OTHER }], DEFAULT, fakeFetch().fn);
    expect(await p.resolveOrigin(ASSET_B)).toBe(DEFAULT);
  });

  test('no override and no default throws; no request is made', async () => {
    const f = fakeFetch();
    const p = provider([], undefined, f.fn);
    await expect(p.resolveOrigin(ASSET_A)).rejects.toBeInstanceOf(NoColorOverlayError);
    await expect(p.spendability(ASSET_A, ['x.0'])).rejects.toBeInstanceOf(NoColorOverlayError);
    await expect(p.submit([`tm_color_${ASSET_A}`], [1, 2, 3])).rejects.toBeInstanceOf(NoColorOverlayError);
    expect(f.calls).toHaveLength(0);
  });

  test('overrides are read on every call', async () => {
    const overrides: ColorOverlayOverride[] = [];
    const p = provider(overrides, DEFAULT, fakeFetch().fn);
    expect(await p.resolveOrigin(ASSET_A)).toBe(DEFAULT);
    overrides.push({ assetId: ASSET_A, origin: OTHER });
    expect(await p.resolveOrigin(ASSET_A)).toBe(OTHER);
  });
});

describe('lookup requests', () => {
  test('spendability is a BRC-24 lookup at the origin root', async () => {
    const f = fakeFetch();
    const p = provider([], DEFAULT, f.fn);
    const answer = await p.spendability(ASSET_A, [`${'c'.repeat(64)}.2`]);
    expect(answer).toEqual({ type: 'output-list', outputs: [] });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe(`${DEFAULT}/lookup`);
    expect(f.calls[0].method).toBe('POST');
    expect(JSON.parse(f.calls[0].body as string)).toEqual({
      service: `ls_color_${ASSET_A}`,
      query: {
        type: 'color-spendability',
        version: 1,
        assetId: ASSET_A,
        topic: `tm_color_${ASSET_A}`,
        outpoints: [`${'c'.repeat(64)}.2`],
      },
    });
  });

  test('admission asks color-admission at the override origin', async () => {
    const f = fakeFetch();
    const p = provider([{ assetId: ASSET_B, origin: OTHER }], DEFAULT, f.fn);
    await p.admission(ASSET_B, [`${'b'.repeat(64)}.1`]);
    expect(f.calls[0].url).toBe(`${OTHER}/lookup`);
    expect(JSON.parse(f.calls[0].body as string).query.type).toBe('color-admission');
  });

  test('a freeform answer is an error, never an empty list', async () => {
    const f = fakeFetch({ type: 'freeform', result: {} });
    const p = provider([], DEFAULT, f.fn);
    await expect(p.spendability(ASSET_A, ['x.0'])).rejects.toThrow();
  });
});

describe('submit requests', () => {
  test('BRC-22 submit: BEEF body, comma-separated X-Topics, STEAK back', async () => {
    const steak = { [`tm_color_${ASSET_A}`]: { outputsToAdmit: [0], coinsToRetain: [] } };
    const f = fakeFetch(steak);
    const p = provider([], DEFAULT, f.fn);
    const result = await p.submit([`tm_color_${ASSET_A}`, `tm_color_${ASSET_B}`], [1, 2, 3]);
    expect(result).toEqual(steak);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe(`${DEFAULT}/submit`);
    expect(f.calls[0].headers['x-topics']).toBe(`tm_color_${ASSET_A},tm_color_${ASSET_B}`);
    expect(f.calls[0].headers['content-type']).toBe('application/octet-stream');
    expect(Array.from(f.calls[0].body as Uint8Array)).toEqual([1, 2, 3]);
  });

  test('topics of tokens on different overlays go to each overlay', async () => {
    const f = fakeFetch({});
    const p = provider([{ assetId: ASSET_B, origin: OTHER }], DEFAULT, f.fn);
    await p.submit([`tm_color_${ASSET_A}`, `tm_color_${ASSET_B}`], [9]);
    expect(f.calls.map((c) => [c.url, c.headers['x-topics']])).toEqual([
      [`${DEFAULT}/submit`, `tm_color_${ASSET_A}`],
      [`${OTHER}/submit`, `tm_color_${ASSET_B}`],
    ]);
  });

  test("a deploy goes to tm_color at the new asset's origin", async () => {
    const tx = new Transaction();
    tx.addOutput({ lockingScript: LockingScript.fromASM('OP_TRUE'), satoshis: 1 });
    const beef = tx.toAtomicBEEF();
    const deployId = `${tx.id('hex')}_0`;
    const f = fakeFetch({});
    const p = provider([{ assetId: deployId, origin: OTHER }], DEFAULT, f.fn);
    await p.submit(['tm_color'], beef);
    expect(f.calls[0].url).toBe(`${OTHER}/submit`);
    expect(f.calls[0].headers['x-topics']).toBe('tm_color');
  });

  test('an unknown topic is refused', async () => {
    const p = provider([], DEFAULT, fakeFetch().fn);
    await expect(p.submit(['tm_other'], [1])).rejects.toThrow('unexpected topic');
  });
});

describe('normalizeOverlayOrigin', () => {
  test('keeps the https origin only', () => {
    expect(normalizeOverlayOrigin(' https://Swap.Skein.Nexus/lookup?x=1 ')).toBe('https://swap.skein.nexus');
    expect(normalizeOverlayOrigin('http://swap.skein.nexus')).toBeUndefined();
    expect(normalizeOverlayOrigin('not a url')).toBeUndefined();
  });
});
