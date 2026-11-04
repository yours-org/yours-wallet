import { describe, expect, test } from 'bun:test';
import type { OneSatContext } from '@1sat/actions';
import type { HandleResolution } from '@1sat/client';
import { createHandleInboxSync, type HeldHandle } from './handles';

const ctx = { wallet: {} } as unknown as OneSatContext;
const held = (handle: string, domain: string): HeldHandle => ({ handle, domain, certifier: 'c', serialNumber: handle });
const resolution = (messagebox: string, ttl = 60) => ({ messagebox, ttl }) as unknown as HandleResolution;

describe('createHandleInboxSync', () => {
  test('one transaction-inbox sync per distinct messagebox, with the overlay', async () => {
    const boxes: Record<string, string> = {
      '@alice@testnet.1sat.app': 'https://alice.testnet.1sat.app',
      '@bob@testnet.1sat.app': 'https://bob.testnet.1sat.app',
      '@carol@other.example': 'https://alice.testnet.1sat.app',
    };
    const calls: unknown[] = [];
    const sync = createHandleInboxSync(ctx, {
      overlay: 'https://swap.skein.nexus',
      listHandles: async () => [
        held('alice', 'testnet.1sat.app'),
        held('bob', 'testnet.1sat.app'),
        held('carol', 'other.example'),
      ],
      resolveHandle: async (h) => resolution(boxes[h]),
      syncInbox: async (_c, input) => {
        calls.push(input);
        return { received: [], skipped: [] };
      },
    });
    await sync();
    expect(calls).toEqual([
      { messageboxUrl: 'https://alice.testnet.1sat.app', overlay: 'https://swap.skein.nexus' },
      { messageboxUrl: 'https://bob.testnet.1sat.app', overlay: 'https://swap.skein.nexus' },
    ]);
  });

  test('no overlay: the input carries none; resolutions cached for their ttl', async () => {
    const calls: unknown[] = [];
    let resolves = 0;
    const sync = createHandleInboxSync(ctx, {
      listHandles: async () => [held('alice', 'a.example')],
      resolveHandle: async () => {
        resolves++;
        return resolution('https://alice.a.example');
      },
      syncInbox: async (_c, input) => {
        calls.push(input);
        return { received: [], skipped: [] };
      },
    });
    await sync();
    await sync();
    expect(calls).toEqual([{ messageboxUrl: 'https://alice.a.example' }, { messageboxUrl: 'https://alice.a.example' }]);
    expect(resolves).toBe(1);
  });

  test('a handle that does not resolve is skipped; the others still sync', async () => {
    const calls: unknown[] = [];
    const sync = createHandleInboxSync(ctx, {
      listHandles: async () => [held('gone', 'a.example'), held('bob', 'a.example')],
      resolveHandle: async (h) => {
        if (h.startsWith('@gone')) throw new Error('404');
        return resolution('https://bob.a.example', 0);
      },
      syncInbox: async (_c, input) => {
        calls.push(input);
        return { received: [], skipped: [] };
      },
    });
    const err = console.error;
    console.error = () => {};
    try {
      await sync();
    } finally {
      console.error = err;
    }
    expect(calls).toEqual([{ messageboxUrl: 'https://bob.a.example' }]);
  });
});
