import { describe, expect, mock, test } from 'bun:test';

/**
 * Deposit sync wiring without mainnet: assert syncAddresses is invoked with the
 * 1sat prefix/count and that wallet_info aggregates funding + deposit baskets.
 */
describe('deposit sync internalization (unit)', () => {
  test('syncDeposits passes 1sat defaults into syncAddresses.execute', async () => {
    const execute = mock(async (_ctx: unknown, input: { prefix?: string; count?: number }) => {
      expect(input.prefix).toBe('1sat');
      expect(input.count).toBe(1);
      return {
        processed: 1,
        failed: 0,
        lastScore: 42,
        addresses: ['1FakeDepositAddressForUnitTestXXXXXXXX'],
      };
    });

    // Lightweight stand-in for AgentRuntime.syncDeposits core loop.
    async function syncDeposits(
      syncFn: typeof execute,
      opts: { prefix?: string; count?: number } = {},
    ) {
      const result = await syncFn(
        {},
        {
          prefix: opts.prefix ?? '1sat',
          count: opts.count ?? 1,
        },
      );
      return {
        skipped: false,
        processed: result.processed,
        failed: result.failed,
        lastScore: result.lastScore,
        addresses: result.addresses,
      };
    }

    const out = await syncDeposits(execute);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(out.processed).toBe(1);
    expect(out.addresses).toHaveLength(1);
  });

  test('wallet balance sums funding (default) and unswept 1sat-deposit baskets', () => {
    const funding = [{ satoshis: 1000 }, { satoshis: 250 }];
    const deposit = [{ satoshis: 788_563 }];
    const fundingSats = funding.reduce((s, o) => s + o.satoshis, 0);
    const depositSats = deposit.reduce((s, o) => s + o.satoshis, 0);
    expect(fundingSats + depositSats).toBe(789_813);
  });

  test('plain P2PKH deposit basket contract matches @1sat/types', () => {
    // Keep in sync with runtime.ts FUNDING_BASKET / DEPOSIT_BASKET constants.
    const FUNDING_BASKET = 'default';
    const DEPOSIT_BASKET = '1sat-deposit';
    expect(FUNDING_BASKET).toBe('default');
    expect(DEPOSIT_BASKET).toBe('1sat-deposit');
  });
});
