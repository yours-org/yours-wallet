import { describe, expect, test } from 'bun:test';
import type { PromptRequest, TransactionPrompt } from '@1sat/permission-module';
import { InMemoryPermissionStore } from '@1sat/wallet-browser';
import { colorPromptRequest, createColorTokenAccessHandler, sighashName, type ColorMessage } from './colorConsent';

const ADMIN = 'abcdefghijklmnopabcdefghijklmnop';
const APP = 'https://swap.example.com';
const ASSET = `${'a'.repeat(64)}_0`;

const facts = {
  assets: [
    {
      assetId: ASSET,
      operations: ['transfer', 'burn'],
      inputAmount: '100',
      foreignAmount: '0',
      authorityInputs: 0,
      foreignAuthorityInputs: 0,
      keptAmount: '30',
      keptAuthorities: 0,
      outgoingAmount: '60',
      outgoingAuthorities: 0,
      transferred: '90',
      burned: '10',
      minted: '0',
    },
  ],
  destinations: [
    {
      outputIndex: 0,
      satoshis: 1,
      lockingScript: '76a914' + '00'.repeat(20) + '88ac',
      assetId: ASSET,
      role: 'value',
      amount: '60',
    },
    { outputIndex: 1, satoshis: 500, lockingScript: '76a914' + '11'.repeat(20) + '88ac' },
  ],
  satoshis: { inputs: 1000, outputs: 502, fee: 498 },
  signatures: [{ outpoint: `${'c'.repeat(64)}.1`, inputIndex: 0, sighashType: 0x41 }],
  lockTime: 0,
};

const send: ColorMessage = { type: 'color_send', handoff: false, ...facts };

const rowsOf = (req: PromptRequest) => (req.payload as unknown as TransactionPrompt).rows;
const panelsOf = (req: PromptRequest) => (req.payload as unknown as TransactionPrompt).panels;

describe('colorPromptRequest', () => {
  test('color_send → a transaction prompt with every leg, destination, total and signature', () => {
    const req = colorPromptRequest(APP, send);
    expect(req.kind).toBe('transaction');
    expect(req.originator).toBe(APP);
    const payload = req.payload as unknown as TransactionPrompt;
    expect(payload.title).toBe('Token Transaction');
    expect(payload.subtitle).toBe(APP);
    const [leg, tokenOut, satsOut] = panelsOf(req);
    expect(leg.tone).toBe('danger'); // burns
    expect(leg.meta).toContainEqual({ key: 'Asset', value: expect.any(String), copyValue: ASSET });
    expect(leg.meta).toContainEqual({ key: 'Outgoing', value: '60' });
    expect(leg.meta).toContainEqual({ key: 'Burned', value: '10' });
    expect(tokenOut.title).toBe('Output #0');
    expect(tokenOut.subtitle).toBe('60 tokens');
    expect(satsOut.variant).toBe('value');
    expect(satsOut.amountSats).toBe(500);
    const rows = rowsOf(req);
    expect(rows).toContainEqual({ key: 'Fee', value: '498 sats' });
    expect(rows).toContainEqual({ key: 'Lock time', value: '0' });
    expect(rows.find((r) => r.key === 'Signs input #0')?.value).toContain('0x41 ALL|FORKID');
  });

  test('a handoff is titled as one', () => {
    const req = colorPromptRequest(APP, { ...send, handoff: true } as ColorMessage);
    expect((req.payload as unknown as TransactionPrompt).title).toBe('Token Handoff');
  });

  test('a deploy gets its own panel first', () => {
    const req = colorPromptRequest(APP, {
      ...send,
      deploy: { operation: 'deploy+mint', amount: '1000', owned: true },
    } as ColorMessage);
    expect(panelsOf(req)[0].title).toBe('New token deploy');
    expect(panelsOf(req)[0].subtitle).toBe('deploy+mint');
  });

  test('color_signature → a transaction-layout prompt naming the signed input', () => {
    const req = colorPromptRequest(APP, { type: 'color_signature', inputIndex: 0, ...facts });
    expect(req.kind).toBe('transaction');
    expect((req.payload as unknown as TransactionPrompt).title).toBe('Token Signature');
    expect(rowsOf(req)).toContainEqual({ key: 'Signs input', value: '#0' });
  });

  test('color_access → basketAccess for the basket read', () => {
    const basket = 'p color balance xyz';
    const req = colorPromptRequest(APP, { type: 'color_access', basket, assetId: ASSET, role: 'value' });
    expect(req.kind).toBe('basketAccess');
    expect(req.payload).toEqual({
      baskets: [{ basket, scope: 'token balance', description: 'View the value balance of this token', value: ASSET }],
    });
  });

  test('color_relinquish → a prompt titled as a removal', () => {
    const req = colorPromptRequest(APP, {
      type: 'color_relinquish',
      assetId: ASSET,
      role: 'value',
      outpoint: `${'d'.repeat(64)}.0`,
    });
    expect((req.payload as unknown as TransactionPrompt).title).toBe('Remove Token Output');
    expect(req.summary).toContain('d'.repeat(64));
  });
});

describe('createColorTokenAccessHandler', () => {
  const setup = (answer: boolean) => {
    const prompts: PromptRequest[] = [];
    const store = new InMemoryPermissionStore();
    const handler = createColorTokenAccessHandler({
      promptHandler: async (req) => {
        prompts.push(req);
        return answer;
      },
      permissionStore: store,
      adminOriginator: ADMIN,
    });
    return { prompts, store, handler };
  };

  const read = (extra: object = {}) =>
    JSON.stringify({ type: 'color_access', basket: 'p color assets', seekPermission: true, ...extra });

  test('admin reads are approved without a prompt', async () => {
    const { prompts, handler } = setup(false);
    expect(await handler(ADMIN, read())).toBe(true);
    expect(prompts).toHaveLength(0);
  });

  test('admin sends and signatures still prompt', async () => {
    const { prompts, handler } = setup(false);
    expect(await handler(ADMIN, JSON.stringify(send))).toBe(false);
    expect(await handler(ADMIN, JSON.stringify({ type: 'color_signature', inputIndex: 0, ...facts }))).toBe(false);
    expect(prompts).toHaveLength(2);
  });

  test('an approved read stores a basket grant; the next read does not prompt', async () => {
    const { prompts, store, handler } = setup(true);
    expect(await handler(APP, read())).toBe(true);
    expect(
      await store.findGrant({ type: 'basket', originator: 'swap.example.com', basket: 'p color assets' }),
    ).not.toBeNull();
    expect(await handler(APP, read())).toBe(true);
    expect(prompts).toHaveLength(1);
  });

  test('an existing basket grant (e.g. from the grouped-permission popup) approves', async () => {
    const { prompts, store, handler } = setup(false);
    await store.putGrant({
      key: { type: 'basket', originator: 'swap.example.com', basket: 'p color assets' },
      expiry: 0,
      grantedAt: Date.now(),
    });
    expect(await handler(APP, read())).toBe(true);
    expect(prompts).toHaveLength(0);
  });

  test('a declined read stores nothing', async () => {
    const { store, handler } = setup(false);
    expect(await handler(APP, read())).toBe(false);
    expect(
      await store.findGrant({ type: 'basket', originator: 'swap.example.com', basket: 'p color assets' }),
    ).toBeNull();
  });

  test('seekPermission false with no grant declines without a prompt', async () => {
    const { prompts, handler } = setup(true);
    expect(await handler(APP, read({ seekPermission: false }))).toBe(false);
    expect(prompts).toHaveLength(0);
  });

  test('label reads prompt every time', async () => {
    const { prompts, handler } = setup(true);
    const labels = JSON.stringify({ type: 'color_access', labels: ['p color plan x'], seekPermission: true });
    await handler(APP, labels);
    await handler(APP, labels);
    expect(prompts).toHaveLength(2);
  });

  test("sends resolve with the user's answer", async () => {
    expect(await setup(true).handler(APP, JSON.stringify(send))).toBe(true);
    expect(await setup(false).handler(APP, JSON.stringify(send))).toBe(false);
  });

  test('unknown or unreadable messages are declined without a prompt', async () => {
    const { prompts, handler } = setup(true);
    expect(await handler(APP, '{not json')).toBe(false);
    expect(await handler(APP, JSON.stringify({ type: 'color_other' }))).toBe(false);
    expect(prompts).toHaveLength(0);
  });
});

test('sighashName', () => {
  expect(sighashName(0x41)).toBe('0x41 ALL|FORKID');
  expect(sighashName(0xc3)).toBe('0xc3 SINGLE|FORKID|ANYONECANPAY');
});
