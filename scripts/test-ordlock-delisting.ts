/** Offline regression checks. Run: npx tsx --test scripts/test-ordlock-delisting.ts */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type { WalletOutput } from '@bsv/sdk';
import {
  cancelOrdinalListing,
  cancelOpnsListing,
  cancelTokenListing,
  listOrdinals,
  listOpns,
  type OneSatContext,
} from '@1sat/actions';
import {
  cancelOwnedOrdLockListings,
  ORDLOCK_CANCEL_INCOMPLETE_MESSAGE,
  ORDLOCK_TAG,
} from '../src/utils/cancelOrdLockListings';

import { pinCwiToIdentity, callPinnedCwi, WALLET_OPERATION_STOPPED } from '../src/utils/accountBoundWallet';

let currentIdentityKey = 'account-a';
const context = { wallet: { getPublicKey: async () => ({ publicKey: currentIdentityKey }) } } as OneSatContext;
const operationControllerRef = { current: new AbortController() };
beforeEach(() => {
  mock.method(listOpns, 'execute', async () => ({ outputs: [], totalOutputs: 0 }));
  currentIdentityKey = 'account-a';
  operationControllerRef.current = new AbortController();
  globalThis.chrome = {
    runtime: {
      id: 'offline-test',
      sendMessage: async (message: { expectedIdentityKey: string; action: string }) => {
        if (message.expectedIdentityKey !== currentIdentityKey)
          return { success: false, error: WALLET_OPERATION_STOPPED };
        assert.equal(message.action, 'getPublicKey', 'unexpected live wallet call');
        return { success: true, data: { publicKey: currentIdentityKey } };
      },
    },
  } as unknown as typeof chrome;
});
const listing = (index: number): WalletOutput => ({
  outpoint: `${index.toString(16).padStart(64, '0')}.0`,
  satoshis: 1,
  spendable: true,
  tags: [ORDLOCK_TAG, `id:ordinal-${index}`],
});
const tokenListing = (index: number): WalletOutput => ({
  outpoint: `${index.toString(16).padStart(64, '0')}.0`,
  satoshis: 1,
  spendable: true,
  tags: [ORDLOCK_TAG, `id:token-${index}`, 'type:application/bsv-20', `bsv21:${'ab'.repeat(32)}_0`, 'amt:1111'],
});
const success = { txid: 'offline-cancellation' };
afterEach(() => mock.restoreAll());

test('snapshots over 100 listings before sequentially cancelling all of them', async () => {
  let owned = Array.from({ length: 237 }, (_, index) => listing(index));
  const pages: number[] = [];
  let active = 0;
  let maxActive = 0;
  mock.method(listOrdinals, 'execute', async (_ctx, input) => {
    assert.deepEqual(input.tags, [ORDLOCK_TAG]);
    pages.push(input.offset);
    return { outputs: owned.slice(input.offset, input.offset + input.limit), totalOutputs: owned.length };
  });
  const cancellation = mock.method(cancelOrdinalListing, 'execute', async (_ctx, { id }) => {
    assert.deepEqual(pages, [0, 100, 200], 'finish discovery before changing output offsets');
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    owned = owned.filter((output) => !output.tags?.includes(`id:${id}`));
    active--;
    return success;
  });
  const progress: number[] = [];
  const result = await cancelOwnedOrdLockListings(context, {
    onProgress: ({ cancelled }) => progress.push(cancelled),
    requireComplete: true,
  });
  assert.equal(result.cancelled, 237);
  assert.equal(cancellation.mock.callCount(), 237);
  assert.equal(maxActive, 1);
  assert.equal(owned.length, 0);
  assert.deepEqual(
    progress,
    Array.from({ length: 238 }, (_, index) => index),
  );
});

test('pages through short responses without a total and deduplicates overlapping outputs', async () => {
  const pages = [[listing(0), listing(1)], [listing(1), listing(2)], []];
  const offsets: number[] = [];
  mock.method(listOrdinals, 'execute', async (_ctx, { offset }) => {
    offsets.push(offset);
    return { outputs: pages.shift()! };
  });
  const cancel = mock.method(cancelOrdinalListing, 'execute', async () => success);
  const result = await cancelOwnedOrdLockListings(context);
  assert.deepEqual(offsets, [0, 2, 4]);
  assert.equal(result.cancelled, 3);
  assert.equal(cancel.mock.callCount(), 3);
});

test('manual selection cancels more than 25, preserves failures, and retries only remaining outputs', async () => {
  const selected = Array.from({ length: 35 }, (_, index) => listing(index));
  const failed = new Set(['ordinal-3', 'ordinal-7']);
  mock.method(listOrdinals, 'execute', async () => {
    throw new Error('manual selections must not rediscover');
  });
  const calls: string[] = [];
  mock.method(cancelOrdinalListing, 'execute', async (_ctx, { id }) => {
    calls.push(id);
    if (id === 'ordinal-3' && failed.has(id)) throw new Error('offline exception');
    return failed.has(id) ? { error: 'offline failure' } : success;
  });
  const result = await cancelOwnedOrdLockListings(context, { outputs: [...selected, selected[0]] });
  assert.equal(result.attempted, 35);
  assert.equal(result.cancelled, 33);
  assert.equal(result.errors.length, 2);
  const remaining = selected.filter((output) => !result.cancelledOutpoints.includes(output.outpoint));
  assert.deepEqual(remaining, [selected[3], selected[7]]);
  failed.clear();
  calls.length = 0;
  const retried = await cancelOwnedOrdLockListings(context, { outputs: remaining });
  assert.deepEqual(calls, ['ordinal-3', 'ordinal-7']);
  assert.equal(retried.cancelled, 2);
});

test('token listings use cancelTokenListing, not ordinal cancel', async () => {
  mock.method(listOrdinals, 'execute', async () => ({
    outputs: [tokenListing(1), listing(2)],
    totalOutputs: 2,
  }));
  const ordinal = mock.method(cancelOrdinalListing, 'execute', async () => success);
  const token = mock.method(cancelTokenListing, 'execute', async () => ({
    txid: 'token-cancellation',
  }));
  const result = await cancelOwnedOrdLockListings(context);
  assert.equal(ordinal.mock.callCount(), 1);
  assert.equal(token.mock.callCount(), 1);
  assert.equal(result.cancelled, 2);
  assert.equal(result.errors.length, 0);
});

test('discovery failure cancels nothing and a later invocation can retry', async () => {
  let unavailable = true;
  mock.method(listOrdinals, 'execute', async () => {
    if (unavailable) throw new Error('offline discovery failure');
    return { outputs: [listing(1)], totalOutputs: 1 };
  });
  const cancel = mock.method(cancelOrdinalListing, 'execute', async () => success);
  const failed = await cancelOwnedOrdLockListings(context);
  assert.equal(failed.errors.length, 1);
  assert.equal(cancel.mock.callCount(), 0);
  unavailable = false;
  assert.equal((await cancelOwnedOrdLockListings(context)).cancelled, 1);
});

test('a completed invocation never hides listings from a different wallet', async () => {
  mock.method(listOrdinals, 'execute', async (_ctx, { offset }) => ({
    outputs: currentIdentityKey === 'account-a' || offset > 0 ? [] : [listing(2)],
  }));
  mock.method(cancelOrdinalListing, 'execute', async () => success);
  assert.equal((await cancelOwnedOrdLockListings(context)).cancelled, 0);
  currentIdentityKey = 'account-b';
  assert.equal((await cancelOwnedOrdLockListings(context)).cancelled, 1);
});

test('repeated pages and premature end cannot be mistaken for complete discovery', async () => {
  for (const repeated of [true, false]) {
    mock.restoreAll();
    mock.method(listOpns, 'execute', async () => ({ outputs: [], totalOutputs: 0 }));
    mock.method(listOrdinals, 'execute', async (_ctx, { offset }) => ({
      outputs: offset === 0 || repeated ? [listing(1)] : [],
      totalOutputs: 3,
    }));
    const cancel = mock.method(cancelOrdinalListing, 'execute', async () => success);
    await assert.rejects(cancelOwnedOrdLockListings(context, { requireComplete: true }), {
      message: ORDLOCK_CANCEL_INCOMPLETE_MESSAGE,
    });
    assert.equal(cancel.mock.callCount(), 0);
  }
});

test('missing tracking ids and cancellation failures block a funding continuation', async () => {
  for (const missingId of [true, false]) {
    mock.restoreAll();
    mock.method(listOpns, 'execute', async () => ({ outputs: [], totalOutputs: 0 }));
    const output = missingId ? { ...listing(1), tags: [ORDLOCK_TAG] } : listing(1);
    mock.method(cancelOrdinalListing, 'execute', async () => ({ error: 'offline cancellation failure' }));
    const spendFunds = mock.fn();
    await assert.rejects(
      cancelOwnedOrdLockListings(context, { outputs: [output], requireComplete: true }).then(spendFunds),
      { message: ORDLOCK_CANCEL_INCOMPLETE_MESSAGE },
    );
    assert.equal(spendFunds.mock.callCount(), 0);
  }
});

// Execute the real UI handlers with mocked surrounding state, without mounting a
// wallet, contacting services, or signing. TypeScript removes only TS syntax.
function handler(file: string, name: string, bindings: Record<string, unknown>, nestedProperty?: string) {
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let initializer: ts.Expression | ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) initializer = node;
    if (ts.isCallExpression(node)) {
      if (name === 'messageListener' && node.expression.getText(source) === 'chrome.runtime.onMessage.addListener')
        initializer = node.arguments[0];
      if (
        name === 'autoDelistEffect' &&
        node.expression.getText(source) === 'useEffect' &&
        node.arguments[0]?.getText(source).includes('cancelOwnedOrdLockListings')
      )
        initializer = node.arguments[0];
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(initializer, `${name} exists`);
  if (nestedProperty) {
    let nested: ts.Expression | undefined;
    const find = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === nestedProperty) nested = node.initializer;
      ts.forEachChild(node, find);
    };
    find(initializer);
    assert.ok(nested, `${nestedProperty} exists`);
    initializer = nested;
  }
  const js = ts.transpileModule(`subject = ${initializer.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const sandbox = { Error, AbortController, ...bindings, subject: undefined };
  vm.runInNewContext(js, sandbox);
  return sandbox.subject as unknown as (...args: unknown[]) => Promise<void>;
}

test('real BSV send-all confirmation returns before spending when delisting fails', async () => {
  mock.method(listOrdinals, 'execute', async () => {
    throw new Error('offline discovery failure');
  });
  const send = mock.fn();
  const processing: boolean[] = [];
  const onConfirm = handler(
    'pages/BsvWallet.tsx',
    'handleSendBsv',
    {
      setSendConfirmation: () => {},
      setIsProcessing: (value: boolean) => processing.push(value),
      isSendAllBsv: true,
      sendRecipients: [{ address: 'offline-destination' }],
      cancelOwnedOrdLockListings,
      apiContext: context,
      sendAllBsv: { execute: send },
      addSnackbar: () => {},
    },
    'onConfirm',
  );
  await onConfirm();
  assert.equal(send.mock.callCount(), 0);
  assert.deepEqual(processing, [true, false]);
});

test('real migration handler stops every sweep and reports delisting failure', async () => {
  mock.method(listOrdinals, 'execute', async () => {
    throw new Error('offline discovery failure');
  });
  const sweep = mock.fn();
  const steps: string[] = [];
  let results: { error?: string }[] = [];
  const execute = handler('pages/SweepMigration.tsx', 'executeSweeps', {
    legacyKeys: {},
    sweepResults: [],
    apiContext: context,
    pinCwiToIdentity,
    operationControllerRef,
    cancelOwnedOrdLockListings,
    setStep: (step: string) => steps.push(step),
    setCurrentSweepOp: () => {},
    setSweepResults: (value: typeof results) => {
      results = value;
    },
    selection: { sweepBsv: true, selectedOrdinals: new Set(['selected']), selectedBsv21TokenIds: new Set() },
    assets: { funding: [{}], ordinals: [{}], bsv21Tokens: [] },
    sweepBsv: { execute: sweep },
    sweepOrdinals: { execute: sweep },
    sweepBsv21: { execute: sweep },
    prepareSweepInputs: sweep,
  });
  await execute();
  assert.equal(sweep.mock.callCount(), 0);
  assert.deepEqual(steps, ['sweeping', 'results']);
  assert.equal(results.length, 1);
  assert.ok(results[0].error);
});

test('real manual handler sends the full selection and retains only failed listings for retry', async () => {
  const selected = [listing(1), listing(2), listing(3)];
  const calls: string[] = [];
  mock.method(cancelOrdinalListing, 'execute', async (_ctx, { id }) => {
    calls.push(id);
    return id === 'ordinal-2' ? { error: 'offline failure' } : success;
  });
  let remaining = selected;
  let errors: string[] = [];
  const execute = handler('pages/OrdWallet.tsx', 'handleCancelListing', {
    isProcessing: false,
    selectedOrdinals: selected,
    apiContext: context,
    pinCwiToIdentity,
    operationControllerRef,
    cancelOwnedOrdLockListings,
    setIsProcessing: () => {},
    setCancelProgress: () => {},
    setCancelErrors: (value: string[]) => {
      errors = value;
    },
    setSelectedOrdinals: (update: (value: typeof selected) => typeof selected) => {
      remaining = update(remaining);
    },
    addSnackbar: () => {},
    refreshOrdinals: async () => {},
    resetSendState: () => assert.fail('must preserve failed selection'),
    setPageState: () => assert.fail('must remain on retry view'),
  });
  await execute({ preventDefault() {} });
  assert.deepEqual(calls, ['ordinal-1', 'ordinal-2', 'ordinal-3']);
  assert.deepEqual(remaining, [selected[1]]);
  assert.equal(errors.length, 1);
});

test('real sweep tab hides SweepApp until delisting succeeds and supports explicit retry', async () => {
  let accountChanged: (changes: Record<string, unknown>, area: string) => void = () =>
    assert.fail('missing account watcher');
  chrome.storage = {
    local: { get: () => {} },
    onChanged: {
      addListener: (listener: typeof accountChanged) => {
        accountChanged = listener;
      },
      removeListener: () => {},
    },
  } as unknown as typeof chrome.storage;
  const SweepApp = () => assert.fail('must not mount a live sweep component');
  type Element = { type: unknown; props: Record<string, unknown>; children: Element[] };
  const state: unknown[] = [{ payPk: 'offline' }, null, false, {}, false, null, 'Cancelling listings...', 0];
  let stateIndex = 0;
  let effects: (() => unknown)[] = [];
  const task = { current: new AbortController() };
  let finish: (result: { txid?: string; error?: string }) => void = () => assert.fail('cancellation not started');
  mock.method(listOrdinals, 'execute', async () => ({ outputs: [listing(1)], totalOutputs: 1 }));
  const cancellation = mock.method(
    cancelOrdinalListing,
    'execute',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const component = handler('sweep-tab.tsx', 'SweepTab', {
    chrome,
    configureServices: () => {},
    SERVICES_BASE_URL: 'offline',
    useState: () => {
      const index = stateIndex++;
      return [
        state[index],
        (value: unknown) => {
          state[index] = typeof value === 'function' ? value(state[index]) : value;
        },
      ];
    },
    useRef: () => task,
    useEffect: (effect: () => unknown) => effects.push(effect),
    OneSatServices: class {},
    createContext: () => context,
    pinCwiToIdentity,
    WALLET_OPERATION_STOPPED,
    cancelOwnedOrdLockListings,
    SweepApp,
    React: {
      createElement: (type: unknown, props: Record<string, unknown>, ...children: Element[]) => ({
        type,
        props,
        children,
      }),
    },
  }) as unknown as () => Element;
  const render = () => {
    stateIndex = 0;
    effects = [];
    return component();
  };
  assert.notEqual(render().type, SweepApp, 'initial render must wait for delisting');
  effects[0](); // Observe account changes; keys are already loaded by this harness.
  effects[1](); // Run the delisting effect after the already-unlocked state setup.
  await new Promise((resolve) => setImmediate(resolve));
  assert.notEqual(render().type, SweepApp, 'in-flight cancellation must block sweep');
  finish({ error: 'offline cancellation failure' });
  await new Promise((resolve) => setImmediate(resolve));
  const failedView = render();
  assert.notEqual(failedView.type, SweepApp, 'failure must keep sweep blocked');
  assert.equal(cancellation.mock.callCount(), 1, 'rendering a failure must not retry');
  const retry = failedView.children.find((child) => child.type === 'button');
  assert.ok(retry, 'explicit retry is available');
  (retry.props.onClick as () => void)();
  render();
  effects[1]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.notEqual(render().type, SweepApp, 'retry must still wait for completion');
  finish(success);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(render().type, SweepApp, 'successful delisting enables sweep');
  assert.equal(cancellation.mock.callCount(), 2);
  const oldWallet = render().props.wallet as OneSatContext['wallet'];
  currentIdentityKey = 'account-b';
  accountChanged({ selectedAccount: { oldValue: 'account-a', newValue: 'account-b' } }, 'local');
  assert.notEqual(render().type, SweepApp, 'changing account invalidates the completed gate');
  assert.equal(state[4], false);
  assert.equal(state[8], null);
  await assert.rejects(
    oldWallet.getPublicKey({ identityKey: true }),
    'the disposed sweep wallet cannot start another operation',
  );
});

test('real migration Done handler does not mark a failed delisting complete', async () => {
  const persist = mock.fn();
  const navigate = mock.fn();
  const done = handler('pages/SweepMigration.tsx', 'handleDone', {
    sweepResults: [{ error: ORDLOCK_CANCEL_INCOMPLETE_MESSAGE }],
    persistSweepFlag: persist,
    navigate,
  });
  await done();
  assert.equal(persist.mock.callCount(), 0);
  assert.equal(navigate.mock.callCount(), 1);
});

test('empty ordinal pages clear the scroll cursor instead of triggering another load', async () => {
  mock.method(listOrdinals, 'execute', async () => ({ outputs: [], totalOutputs: 0 }));
  for (const name of ['loadOrdinals', 'refreshOrdinals']) {
    let cursor: string | undefined = '0';
    const load = handler('pages/OrdWallet.tsx', name, {
      useCallback: (callback: unknown) => callback,
      apiContext: context,
      from: '0',
      ordinals: [],
      listOrdinals,
      setIsProcessing: () => {},
      setOrdinals: () => {},
      setFrom: (value: string | undefined) => {
        cursor = value;
      },
    });
    await load();
    assert.equal(cursor, undefined);
  }
});

test('account change or disposal during cancellation stops the pass without success or funding', async () => {
  for (const stop of ['account', 'dispose']) {
    mock.restoreAll();
    mock.method(listOpns, 'execute', async () => ({ outputs: [], totalOutputs: 0 }));
    currentIdentityKey = 'account-a';
    const controller = new AbortController();
    mock.method(listOrdinals, 'execute', async () => ({ outputs: [listing(1), listing(2)], totalOutputs: 2 }));
    const cancel = mock.method(cancelOrdinalListing, 'execute', async () => {
      if (stop === 'account') currentIdentityKey = 'account-b';
      else controller.abort();
      return success;
    });
    const spend = mock.fn();
    await assert.rejects(
      cancelOwnedOrdLockListings(context, { signal: controller.signal, requireComplete: true }).then(spend),
    );
    assert.equal(cancel.mock.callCount(), 1, 'must not invoke the next listing');
    assert.equal(spend.mock.callCount(), 0);
  }
});

test('account change between discovery pages stops before another page or cancellation', async () => {
  const list = mock.method(listOrdinals, 'execute', async () => {
    currentIdentityKey = 'account-b';
    return { outputs: [listing(1)], totalOutputs: 2 };
  });
  const cancel = mock.method(cancelOrdinalListing, 'execute', async () => success);
  const result = await cancelOwnedOrdLockListings(context);
  assert.equal(list.mock.callCount(), 1);
  assert.equal(cancel.mock.callCount(), 0);
  assert.equal(result.cancelled, 0);
  assert.ok(result.errors.length > 0);
});

test('ordinals tab does not cancel listings on load', () => {
  assert.throws(
    () => handler('pages/OrdWallet.tsx', 'autoDelistEffect', { apiContext: context }),
    /autoDelistEffect exists/,
  );
});

test('bound CWI rejects a later operation inside an already-running SDK action after account change', async () => {
  const bound = await pinCwiToIdentity(context);
  await bound.wallet.getPublicKey({ identityKey: true });
  currentIdentityKey = 'account-b';
  await assert.rejects(bound.wallet.createAction({ description: 'offline test' }), {
    message: WALLET_OPERATION_STOPPED,
  });
});

test('background pins the actual wallet across identity lookup and native method completion', async () => {
  let finishIdentity: (result: { publicKey: string }) => void = () => assert.fail();
  const create = mock.fn(async () => success);
  const wallet = {
    getPublicKey: () =>
      new Promise((resolve) => {
        finishIdentity = resolve;
      }),
    createAction: create,
  } as unknown as OneSatContext['wallet'];
  let current = true;
  const pending = callPinnedCwi({
    wallet,
    expectedIdentityKey: 'account-a',
    action: 'createAction',
    params: { description: 'offline test' },
    originator: 'chrome-extension://offline-test',
    isCurrent: () => current,
  });
  current = false;
  finishIdentity({ publicKey: 'account-a' });
  await assert.rejects(pending, { message: WALLET_OPERATION_STOPPED });
  assert.equal(create.mock.callCount(), 0, 'a replaced wallet must not receive a new operation');

  current = true;
  let finishAction: (result: typeof success) => void = () => assert.fail();
  wallet.getPublicKey = async () => ({ publicKey: 'account-a' });
  wallet.createAction = () =>
    new Promise((resolve) => {
      finishAction = resolve;
    });
  const accepted = callPinnedCwi({
    wallet,
    expectedIdentityKey: 'account-a',
    action: 'createAction',
    params: { description: 'offline test' },
    originator: 'chrome-extension://offline-test',
    isCurrent: () => current,
  });
  await new Promise((resolve) => setImmediate(resolve));
  current = false;
  finishAction(success);
  await assert.rejects(
    accepted,
    { message: WALLET_OPERATION_STOPPED },
    'accepted transactions cannot become completion for a different account',
  );
});

test('background preserves native permission routing and admin send-all handling', async () => {
  const managed = mock.fn(async (_params, originator) => {
    assert.equal(originator, 'chrome-extension://offline-test');
    return success;
  });
  const base = mock.fn(async () => success);
  const wallet = {
    getPublicKey: async () => ({ publicKey: 'account-a' }),
    createAction: managed,
  } as unknown as OneSatContext['wallet'];
  const baseWallet = { createAction: base } as unknown as OneSatContext['wallet'];
  for (const satoshis of [1, 2099999999999999]) {
    await callPinnedCwi({
      wallet,
      baseWallet,
      expectedIdentityKey: 'account-a',
      action: 'createAction',
      params: { outputs: [{ satoshis }] },
      originator: 'chrome-extension://offline-test',
      isCurrent: () => true,
    });
  }
  assert.equal(managed.mock.callCount(), 1);
  assert.equal(base.mock.callCount(), 1);
});

test('real background listener rejects account-bound calls from content-script web origins', async () => {
  const listener = handler('background.ts', 'messageListener', { chrome, console: { log() {} } });
  for (const origin of ['https://example.test', undefined, 'chrome-extension://another-extension']) {
    let response: { success?: boolean; error?: string } = {};
    await listener(
      { action: 'createAction', expectedIdentityKey: 'account-a' },
      { id: 'offline-test', origin },
      (value: typeof response) => {
        response = value;
      },
    );
    assert.equal(response.success, false);
    assert.equal(response.error, 'Unauthorized');
  }
});

test('real migration preview refuses partial address scans and allows an explicit complete retry', async () => {
  const emptyAssets = {
    funding: [],
    ordinals: [],
    opnsNames: [],
    bsv21Tokens: [],
    bsv20Tokens: [],
    locked: [],
    run: [],
    listings: [],
    totalBsv: 0,
  };
  let failIdentity = true;
  const scanned: string[] = [];
  const steps: string[] = [];
  const failures: boolean[] = [];
  const setAssets = mock.fn();
  const scan = handler('pages/SweepMigration.tsx', 'runScan', {
    legacyKeys: { walletWif: 'pay', ordWif: 'ord', identityWif: 'identity' },
    apiContext: { services: {} },
    operationControllerRef,
    useCallback: (callback: unknown) => callback,
    PrivateKey: { fromWif: (wif: string) => ({ toPublicKey: () => ({ toAddress: () => wif }) }) },
    scanAddress: async (_services: unknown, owner: string) => {
      scanned.push(owner);
      if (owner === 'identity' && failIdentity) throw new Error('incomplete scan');
      return emptyAssets;
    },
    setScanStatuses() {},
    setScanFailed: (failed: boolean) => failures.push(failed),
    setAssets,
    setStep: (step: string) => steps.push(step),
  });
  await scan();
  assert.equal(setAssets.mock.callCount(), 0);
  assert.deepEqual(steps, []);
  assert.deepEqual(failures, [false, true]);
  failIdentity = false;
  await scan();
  assert.equal(setAssets.mock.callCount(), 1);
  assert.deepEqual(steps, ['review']);
  assert.deepEqual(scanned, ['pay', 'ord', 'identity', 'pay', 'ord', 'identity']);
});

test('real migration execution refreshes imported inventory and retains earlier transaction receipts', async () => {
  mock.method(listOrdinals, 'execute', async () => ({ outputs: [], totalOutputs: 0 }));
  const fresh = { listings: [{ outpoint: 'fresh-listing' }] };
  const completed = new Set(['previous-output']);
  const keys = new Map([
    ['pay', {}],
    ['ord', {}],
    ['identity', {}],
  ]);
  let results: Array<{ txid?: string }> = [];
  const operations: string[] = [];
  const execute = handler('pages/SweepMigration.tsx', 'executeSweeps', {
    legacyKeys: {},
    sweepResults: [{ type: 'ordinals', label: 'Earlier cancellation', txid: 'earlier-receipt' }],
    apiContext: { ...context, services: {} },
    operationControllerRef,
    pinCwiToIdentity,
    cancelOwnedOrdLockListings,
    importedKeyMap: () => keys,
    scanAddresses: async (_services: unknown, owners: string[]) => {
      assert.deepEqual([...owners], ['pay', 'ord', 'identity']);
      operations.push('scan');
      return fresh;
    },
    sweepImportedAssets: async (
      _ctx: unknown,
      assets: unknown,
      receivedKeys: unknown,
      _selection: unknown,
      options: { completed: unknown; onResult: (result: unknown) => void },
    ) => {
      assert.equal(assets, fresh);
      assert.equal(receivedKeys, keys);
      assert.equal(options.completed, completed);
      operations.push('sweep');
      options.onResult({ type: 'ordinals', label: 'Imported cancellation', txid: 'new-receipt' });
    },
    completedImportedOutputsRef: { current: completed },
    selection: {},
    setStep() {},
    setCurrentSweepOp() {},
    setSweepResults: (value: typeof results) => {
      results = value;
    },
  });
  await execute();
  assert.deepEqual(operations, ['scan', 'sweep']);
  assert.deepEqual(
    Array.from(results, (result) => result.txid),
    ['earlier-receipt', 'new-receipt'],
  );
});

test('OpNS-only and mixed basket listings use their native cancellation actions', async () => {
  for (const mixed of [false, true]) {
    mock.restoreAll();
    const discovered: string[] = [];
    mock.method(listOrdinals, 'execute', async () => {
      discovered.push('1sat');
      return { outputs: mixed ? [listing(1)] : [], totalOutputs: mixed ? 1 : 0 };
    });
    mock.method(listOpns, 'execute', async () => {
      discovered.push('opns');
      return { outputs: [listing(2)], totalOutputs: 1 };
    });
    const ordinal = mock.method(cancelOrdinalListing, 'execute', async () => {
      assert.deepEqual(discovered, ['1sat', 'opns']);
      return { txid: 'ordinal-receipt' };
    });
    const opns = mock.method(cancelOpnsListing, 'execute', async (_ctx, { id }) => {
      assert.deepEqual(discovered, ['1sat', 'opns']);
      assert.equal(id, 'ordinal-2');
      return { txid: 'opns-receipt' };
    });
    const result = await cancelOwnedOrdLockListings(context, { requireComplete: true });
    assert.equal(result.cancelled, mixed ? 2 : 1);
    assert.equal(ordinal.mock.callCount(), mixed ? 1 : 0);
    assert.equal(opns.mock.callCount(), 1);
    assert.deepEqual(result.txids, mixed ? ['ordinal-receipt', 'opns-receipt'] : ['opns-receipt']);
  }
});

test('OpNS discovery failure blocks all cancellation and funding', async () => {
  mock.method(listOrdinals, 'execute', async () => ({ outputs: [listing(1)], totalOutputs: 1 }));
  mock.method(listOpns, 'execute', async () => {
    throw new Error('retry OpNS discovery');
  });
  const cancel = mock.method(cancelOrdinalListing, 'execute', async () => success);
  const funding = mock.fn();
  await assert.rejects(cancelOwnedOrdLockListings(context, { requireComplete: true }).then(funding));
  assert.equal(cancel.mock.callCount(), 0);
  assert.equal(funding.mock.callCount(), 0);
});

test('final inventory page requests remaining known count for native toolbox totals', async () => {
  const outputs = Array.from({ length: 103 }, (_, i) => listing(i));
  const limits: number[] = [];
  mock.method(listOrdinals, 'execute', async (_ctx, { offset, limit }) => {
    limits.push(limit);
    const page = outputs.slice(offset, offset + limit);
    return { outputs: page, totalOutputs: page.length < limit ? page.length : outputs.length };
  });
  mock.method(cancelOrdinalListing, 'execute', async () => success);
  assert.equal((await cancelOwnedOrdLockListings(context, { requireComplete: true })).cancelled, 103);
  assert.deepEqual(limits, [100, 3]);
});

test('blank native cancellation receipts in either basket block funding', async () => {
  for (const basket of ['1sat', 'opns'] as const) {
    const action = basket === 'opns' ? cancelOpnsListing : cancelOrdinalListing;
    mock.method(action, 'execute', async () => ({ txid: '   ' }));
    const funding = mock.fn();
    await assert.rejects(
      cancelOwnedOrdLockListings(context, { outputs: [listing(1)], basket, requireComplete: true }).then(funding),
    );
    assert.equal(funding.mock.callCount(), 0);
    const result = await cancelOwnedOrdLockListings(context, { outputs: [listing(1)], basket });
    assert.equal(result.cancelled, 0);
    assert.deepEqual(result.txids, []);
  }
});
