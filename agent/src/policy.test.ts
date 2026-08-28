import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PolicyEngine, originatorAllowed, spendFromCreateAction, type AgentPolicy } from './policy';

const policy: AgentPolicy = {
  originators: ['yours-agent://mcp', 'http://localhost', 'http://127.0.0.1'],
  maxSatsPerAction: 1000,
  maxSatsPerHour: 2500,
  maxSatsPerDay: 4000,
};

function engine(): PolicyEngine {
  const dir = mkdtempSync(join(tmpdir(), 'yours-agent-policy-'));
  writeFileSync(join(dir, 'spend-log.json'), JSON.stringify({ entries: [] }));
  return new PolicyEngine(policy, join(dir, 'spend-log.json'));
}

describe('originatorAllowed', () => {
  test('allows MCP originator', () => {
    expect(originatorAllowed('yours-agent://mcp', policy.originators)).toBe(true);
  });

  test('allows localhost with a port', () => {
    expect(originatorAllowed('http://localhost:3000', policy.originators)).toBe(true);
    expect(originatorAllowed('http://127.0.0.1:3321', policy.originators)).toBe(true);
  });

  test('rejects unknown origins', () => {
    expect(originatorAllowed('https://evil.example', policy.originators)).toBe(false);
  });
});

describe('spendFromCreateAction', () => {
  test('sums output satoshis', () => {
    expect(spendFromCreateAction({ outputs: [{ satoshis: 100 }, { satoshis: 50 }] })).toBe(150);
  });

  test('treats missing outputs as zero', () => {
    expect(spendFromCreateAction({ description: 'noop' })).toBe(0);
  });
});

describe('PolicyEngine spend caps', () => {
  test('rejects over per-action cap with remaining budget', () => {
    const p = engine();
    try {
      p.assertSpend(1001);
      throw new Error('expected cap error');
    } catch (err) {
      const e = err as { code: string; extra: { remaining: { maxSatsPerAction: number } } };
      expect(e.code).toBe('ERR_SPEND_CAP');
      expect(e.extra.remaining.maxSatsPerAction).toBe(1000);
    }
  });

  test('records spend against hourly and daily caps', () => {
    const p = engine();
    const now = 1_000_000;
    p.assertSpend(900, now);
    p.recordSpend(900, 'yours-agent://mcp', now);
    p.assertSpend(900, now + 1000);
    p.recordSpend(900, 'yours-agent://mcp', now + 1000);
    try {
      p.assertSpend(900, now + 2000);
      throw new Error('expected hourly cap error');
    } catch (err) {
      const e = err as { code: string; extra: { remaining: { hourRemaining: number } } };
      expect(e.code).toBe('ERR_SPEND_CAP');
      expect(e.extra.remaining.hourRemaining).toBe(700);
    }
  });

  test('rejects originators not on the allowlist', () => {
    const p = engine();
    expect(() => p.assertOriginator('https://attacker.test')).toThrow();
  });
});
