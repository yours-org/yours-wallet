import { describe, expect, test } from 'bun:test';
import { TokenActionMarks, isColorAction, normalizeTokenOriginator } from './tokenActionMark';

const PLAN = { labels: ['p color plan 0 1 abcd'] };

describe('isColorAction', () => {
  test('true for a p color label, false otherwise', () => {
    expect(isColorAction(PLAN)).toBe(true);
    expect(isColorAction({ labels: ['swap', 'p color plan 0 1 ab'] })).toBe(true);
    expect(isColorAction({ labels: ['p colorful'] })).toBe(false);
    expect(isColorAction({ labels: ['swap'] })).toBe(false);
    expect(isColorAction({})).toBe(false);
  });
});

describe('normalizeTokenOriginator', () => {
  test('matches the manager rule', () => {
    expect(normalizeTokenOriginator('https://Swap.Skein.Nexus:443')).toBe('swap.skein.nexus');
    expect(normalizeTokenOriginator('swap.skein.nexus:8080')).toBe('swap.skein.nexus');
    expect(normalizeTokenOriginator('localhost')).toBe('localhost');
    expect(normalizeTokenOriginator('')).toBe('');
  });
});

describe('TokenActionMarks', () => {
  test('marked only while a token createAction runs', async () => {
    const marks = new TokenActionMarks();
    let inside = false;
    await marks.run('https://swap.skein.nexus', PLAN, async () => {
      inside = marks.has('swap.skein.nexus');
    });
    expect(inside).toBe(true);
    expect(marks.has('swap.skein.nexus')).toBe(false);
  });

  test('a plain action is not marked', async () => {
    const marks = new TokenActionMarks();
    let inside = true;
    await marks.run('swap.skein.nexus', { labels: ['swap'] }, async () => {
      inside = marks.has('swap.skein.nexus');
    });
    expect(inside).toBe(false);
  });

  test('cleared on throw', async () => {
    const marks = new TokenActionMarks();
    await expect(
      marks.run('swap.skein.nexus', PLAN, async () => {
        throw new Error('declined');
      }),
    ).rejects.toThrow('declined');
    expect(marks.has('swap.skein.nexus')).toBe(false);
  });

  test('counted across concurrent calls; other origins unaffected', async () => {
    const marks = new TokenActionMarks();
    let releaseA!: () => void;
    const a = marks.run('swap.skein.nexus', PLAN, () => new Promise<void>((r) => (releaseA = r)));
    let releaseB!: () => void;
    const b = marks.run('swap.skein.nexus', PLAN, () => new Promise<void>((r) => (releaseB = r)));
    expect(marks.has('swap.skein.nexus')).toBe(true);
    expect(marks.has('other.example')).toBe(false);
    releaseA();
    await a;
    expect(marks.has('swap.skein.nexus')).toBe(true);
    releaseB();
    await b;
    expect(marks.has('swap.skein.nexus')).toBe(false);
  });
});
