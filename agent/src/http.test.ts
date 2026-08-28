import { describe, expect, test } from 'bun:test';
import { AgentError } from './errors';
import { handleWalletRequest } from './http';
import { spendFromCreateAction } from './policy';

describe('HTTP JSON substrate', () => {
  test('GET /getVersion and POST /getNetwork', async () => {
    const caller = async (method: string) => {
      if (method === 'getVersion') return { version: 'yours-agent-test' };
      if (method === 'getNetwork') return { network: 'test' };
      throw new Error(method);
    };

    const version = await handleWalletRequest(new Request('http://127.0.0.1:3321/getVersion'), caller);
    expect(version.status).toBe(200);
    expect(await version.json()).toEqual({ version: 'yours-agent-test' });

    const network = await handleWalletRequest(
      new Request('http://127.0.0.1:3321/getNetwork', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      caller,
    );
    expect(network.status).toBe(200);
    expect(await network.json()).toEqual({ network: 'test' });
  });

  test('over-cap createAction returns remaining budget and does not mention keys', async () => {
    const caller = async (method: string, args: unknown) => {
      const sats = spendFromCreateAction(args);
      if (sats > 10) {
        throw new AgentError('ERR_SPEND_CAP', `Spend of ${sats} sats exceeds the per-action cap`, {
          remaining: { maxSatsPerAction: 10, hourRemaining: 50, dayRemaining: 200 },
        }, 403);
      }
      return { txid: 'ok' };
    };

    const res = await handleWalletRequest(
      new Request('http://127.0.0.1:3321/createAction', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Originator: 'yours-agent://mcp' },
        body: JSON.stringify({
          description: 'too big',
          outputs: [{ lockingScript: '76a91488ac', satoshis: 999999, outputDescription: 'x' }],
        }),
      }),
      caller,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; remaining: { maxSatsPerAction: number }; description: string };
    expect(body.code).toBe('ERR_SPEND_CAP');
    expect(body.remaining.maxSatsPerAction).toBe(10);
    expect(JSON.stringify(body)).not.toMatch(/PASSWORD|PRIVATE_KEY_WIF/i);
  });

  test('does not invoke a Bun.serve Server object as WalletCaller', async () => {
    const fakeServer = { hostname: '127.0.0.1' };
    const res = await handleWalletRequest(
      new Request('http://127.0.0.1:3321/getVersion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      fakeServer as unknown as (method: string, args: unknown, originator: string) => Promise<unknown>,
    );
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/is not a function/);
    expect((body as { code?: string }).code).not.toBe('ERR_INTERNAL');
  });

  test('GET /listOutputs is allowed', async () => {
    const res = await handleWalletRequest(
      new Request('http://127.0.0.1:3321/listOutputs?x=1'),
      async () => ({ totalOutputs: 0, outputs: [] }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totalOutputs: 0, outputs: [] });
  });

  test('POST /signMessage returns identity BSM compact base64 via caller', async () => {
    const caller = async (method: string, args: unknown) => {
      expect(method).toBe('signMessage');
      expect((args as { message: string }).message).toBe('aibounties-auth-v1:chal');
      return {
        signature: 'fakeCompactBase64Signature==',
        publicKey: '02' + 'ab'.repeat(32),
        address: '1Fake',
        message: 'aibounties-auth-v1:chal',
      };
    };
    const res = await handleWalletRequest(
      new Request('http://127.0.0.1:3321/signMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Originator: 'yours-agent://mcp' },
        body: JSON.stringify({ message: 'aibounties-auth-v1:chal' }),
      }),
      caller,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signature: string; publicKey: string };
    expect(body.signature).toContain('fakeCompact');
    expect(body.publicKey.startsWith('02')).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/PASSWORD|PRIVATE_KEY_WIF|[5KL][1-9A-HJ-NP-Za-km-z]{50,52}/);
  });

  test('POST /syncAddresses is routed', async () => {
    const res = await handleWalletRequest(
      new Request('http://127.0.0.1:3321/syncAddresses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Originator: 'http://localhost' },
        body: JSON.stringify({ force: true }),
      }),
      async (method, args) => {
        expect(method).toBe('syncAddresses');
        expect((args as { force: boolean }).force).toBe(true);
        return { skipped: false, processed: 0, failed: 0, lastScore: 0, addresses: [] };
      },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: 0 });
  });
});
