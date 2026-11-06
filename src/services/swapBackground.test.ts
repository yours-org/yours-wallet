import { describe, expect, mock, test } from 'bun:test';
import { createSwapService, type ClientProgress, type SwapClient } from './swapBackground';
import type { SwapJob, SwapQuoteRequest } from './swapTypes';

const req: SwapQuoteRequest = {
  token: { tokenId: 'ab'.repeat(32) + '_0', sym: 'BODEN', dec: 0 },
  side: 'buy',
  amountIn: '50000000',
  slippageBps: 100,
  maxSources: 5,
};

const leg = (n: number) => ({
  poolOutpoint: `pool${n}.0`,
  poolId: `pool${n}_0`,
  amountIn: 25_000_000n,
  amountOut: 59_000_000n,
  txid: `tx${n}`,
});

const quote = {
  request: {
    tokenId: req.token.tokenId,
    side: 'buy' as const,
    amountIn: 50_000_000n,
    maxSlippageBps: 100,
    maxSources: 5,
  },
  legs: [
    { fees: { lpBps: 30, validatorBps: 5, commissionBps: 0 } },
    { fees: { lpBps: 30, validatorBps: 5, commissionBps: 0 } },
  ],
  amountOut: 118_000_000n,
  minAmountOut: 116_820_000n,
  effectivePrice: 0.42,
  marginalPrice: 0.4,
  impactBps: 42,
  stage: { amount: 50_000_000n, feeSats: 210n },
  legMinerFeeSats: 150n,
};

const fakeClient = (
  script: (
    onProgress: (p: ClientProgress) => void,
  ) => Promise<ReturnType<SwapClient['executeSwap']> extends Promise<infer R> ? R : never>,
): SwapClient => ({
  tokenPools: async () => ({ pools: [{}, {}] }),
  quoteSwap: () => quote,
  executeSwap: (_q, o) => script(o?.onProgress ?? (() => {})),
  hostedTokens: async () => [{ tokenId: req.token.tokenId, sym: 'BODEN', dec: 0, marginalPrice: 0.4, pools: 2 }],
  enabledList: async () => [{ tokenId: req.token.tokenId, status: 'enabled' }],
  tokensToEnable: async () => [{ tokenId: 'cd'.repeat(32) + '_0' }],
  enableTokenPaid: async () => ({}),
  defaults: async () => ({ enablePriceSats: 10_000 }),
  moveBackTokens: mock(async () => ({ txid: 'back', amount: 7n })),
});

const settled = async (service: ReturnType<typeof createSwapService>, id: string) => {
  for (let i = 0; i < 50; i++) {
    const j = service.get(id);
    if (
      j &&
      (j.phase === 'done' || j.phase === 'failed') &&
      (j.phase !== 'failed' || j.errorKind === 'user_rejected' || j.recovered !== undefined || j.result)
    )
      return j;
    await new Promise((r) => setTimeout(r, 5));
  }
  return service.get(id)!;
};

describe('swap service', () => {
  test('a quote crosses as strings with the first leg fees and pool count', async () => {
    const service = createSwapService({
      client: () =>
        fakeClient(async () => ({
          status: 'filled',
          stop: 'filled',
          legs: [],
          totalIn: 0n,
          totalOut: 0n,
          unfilled: 0n,
        })),
      broadcast: () => {},
    });
    const q = await service.quote(req);
    expect(q.amountOut).toBe('118000000');
    expect(q.minAmountOut).toBe('116820000');
    expect(q.legs).toBe(2);
    expect(q.fees).toEqual({ lpBps: 30, validatorBps: 5, commissionBps: 0 });
    expect(q.stageFeeSats).toBe('210');
  });

  test('a filled swap walks staging → relaying → done and broadcasts each step', async () => {
    const seen: SwapJob[] = [];
    const client = fakeClient(async (onProgress) => {
      onProgress({ phase: 'staging', sats: 50_000_000n, tokens: 0n });
      onProgress({ phase: 'relaying', leg: 'pool1.0', amountIn: 25_000_000n, amountOut: 59_000_000n, filled: [] });
      onProgress({
        phase: 'relaying',
        leg: 'pool2.0',
        amountIn: 25_000_000n,
        amountOut: 59_000_000n,
        filled: [leg(1)],
      });
      const result = {
        status: 'filled' as const,
        stop: 'filled' as const,
        legs: [leg(1), leg(2)],
        totalIn: 50_000_000n,
        totalOut: 118_000_000n,
        unfilled: 0n,
      };
      onProgress({ phase: 'done', result });
      return result;
    });
    const service = createSwapService({
      client: () => client,
      broadcast: (j) => seen.push(j),
      now: () => 1000,
      newId: () => 'job1',
    });
    const started = await service.start(req);
    expect(started.id).toBe('job1');
    const final = await settled(service, 'job1');
    expect(final.phase).toBe('done');
    expect(final.result?.status).toBe('filled');
    expect(final.filled.map((l) => l.txid)).toEqual(['tx1', 'tx2']);
    expect(final.filled[0].amountOut).toBe('59000000');
    expect(seen.map((j) => j.phase)).toEqual(['queued', 'staging', 'relaying', 'relaying', 'done']);
    expect(seen[1].stagedSats).toBe('50000000');
    expect(seen[2].leg).toBe('pool1.0');
  });

  test('a thrown swap is failed, recorded, and its tokens moved back', async () => {
    const client = fakeClient(async () => {
      throw new Error('relay down');
    });
    const service = createSwapService({ client: () => client, broadcast: () => {}, newId: () => 'job2' });
    await service.start(req);
    const final = await settled(service, 'job2');
    expect(final.phase).toBe('failed');
    expect(final.error).toBe('relay down');
    expect(final.recovered).toBe(true);
    expect(client.moveBackTokens).toHaveBeenCalledWith(req.token.tokenId);
  });

  test('a partial fill keeps the returned amount', async () => {
    const client = fakeClient(async (onProgress) => {
      const result = {
        status: 'partial' as const,
        stop: 'floor' as const,
        legs: [leg(1)],
        totalIn: 25_000_000n,
        totalOut: 59_000_000n,
        unfilled: 25_000_000n,
        returned: { txid: 'ret', tokens: 25_000_000n },
      };
      onProgress({ phase: 'returning', filled: [leg(1)] });
      onProgress({ phase: 'done', result });
      return result;
    });
    const service = createSwapService({ client: () => client, broadcast: () => {}, newId: () => 'job3' });
    await service.start(req);
    const final = await settled(service, 'job3');
    expect(final.phase).toBe('done');
    expect(final.result?.status).toBe('partial');
    expect(final.result?.returned).toEqual({ txid: 'ret', tokens: '25000000' });
  });

  test('token status: listed with pools, a deployer candidate can list, nothing without a client', async () => {
    const client = fakeClient(async () => ({
      status: 'filled',
      stop: 'filled',
      legs: [],
      totalIn: 0n,
      totalOut: 0n,
      unfilled: 0n,
    }));
    const service = createSwapService({ client: () => client, broadcast: () => {} });
    expect(await service.tokenStatus(req.token.tokenId)).toEqual({
      tokenId: req.token.tokenId,
      available: true,
      listed: true,
      pools: 2,
      marginalPrice: 0.4,
      canList: false,
    });
    const mine = 'cd'.repeat(32) + '_0';
    expect(await service.tokenStatus(mine)).toMatchObject({
      available: true,
      listed: false,
      pools: 0,
      canList: true,
      listFeeSats: 10_000,
    });
    const off = createSwapService({ client: () => undefined, broadcast: () => {} });
    expect(await off.tokenStatus(mine)).toMatchObject({ available: false, listed: false, canList: false });
    await expect(off.quote(req)).rejects.toThrow('not available');
  });
});
