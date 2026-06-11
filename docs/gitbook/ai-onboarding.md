---
description: Primer for AI agents using these docs to build against Yours Wallet.
icon: robot
---

# For AI Agents

Read this before doing anything else. It encodes the mental model so the rest of the docs make sense in one pass.

## What Yours Wallet is

A Chrome extension wallet for BSV. It is non-custodial (keys stay on device) and built on the [BRC-100](concepts/brc-100.md) wallet interface standard. dApps connect to it via the `@1sat/actions` package, not via an injected `window` global.

The wallet tracks **two things**:

1. The user's keys (BRC-42 derived under various protocols).
2. Their on-chain transaction history (so it can find their outputs to spend).

That second part is the BRC-100 leap from older injected-provider wallets — the wallet is stateful and knows what the user owns, not just what keys they hold.

## The integration pattern

Every action follows the same pattern:

```tsx
import { WalletProvider, useWallet } from '@1sat/react';
import { createContext, sendBsv } from '@1sat/actions';
import { OneSatServices } from '@1sat/client';

const services = new OneSatServices('main');

function MyComponent() {
  const { wallet, status } = useWallet();
  const ctx = useMemo(() => {
    if (status !== 'connected' || !wallet) return null;
    return createContext(wallet, { chain: 'main', services });
  }, [wallet, status]);

  // then: await sendBsv.execute(ctx, { ... })
}
```

* `WalletProvider` (around your app) auto-detects BRC-100 wallets and manages connection state.
* `useWallet()` returns `{ wallet, status, identityKey, connect, disconnect, providerType }`.
* `createContext(wallet, { chain, services })` produces an opaque `ctx` you pass to every action.
* `action.execute(ctx, input)` performs the operation.

## The return shape

Every write-type action returns `{ txid?: string, error?: string, ... }`. You MUST check both:

```ts
try {
  const result = await sendBsv.execute(ctx, { requests: [...] });
  if (result.error) {
    // action-level error: user rejected, validation failed, etc.
    return;
  }
  // result.txid is now defined
} catch (err) {
  // transport / network / unexpected error
}
```

{% hint style="warning" %}
Do not destructure `txid` without first checking `error`. The two are mutually exclusive on a clean response, but ignoring the error leads to undefined access.
{% endhint %}

## The BEEF requirement

For any operation that **spends an existing ordinal output** — `transferOrdinals`, `listOrdinal`, `cancelListing`, `opnsRegister`, `opnsDeregister`, `burnOrdinals` — you must first call `getOrdinals` to fetch both the output object and its BEEF (transaction ancestry):

```ts
const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
if (!BEEF) throw new Error('No BEEF available');
const ordinal = outputs.find(o => o.outpoint === targetOutpoint);

await transferOrdinals.execute(ctx, {
  transfers: [{ ordinal, address: '1Recipient...' }],
  inputBEEF: Array.from(BEEF),
});
```

`BEEF` may be `undefined` if the wallet has no ordinals — always check. See [BEEF concept](concepts/beef.md).

## Baskets and tags

Outputs live in named **baskets** (`default` is the BSV basket; ordinals live in other baskets). Outputs carry **tags** like `origin`, `origin:<outpoint>`, `type:<mime>`, `name:<string>`. Use `wallet.listOutputs({ basket, tags, includeTags, limit })` to query. See [Baskets & Tags](concepts/baskets-and-tags.md).

## Permissions

Every action that signs or broadcasts will prompt the user in the wallet. If they reject, the action returns `error: 'user-rejected'` (or throws). Account-switching emits a `switchAccount` event; sign-out emits `signedOut`. See [Permissions](concepts/permissions.md) and [Events](reference/events.md).

## MNEE has its own rules

MNEE (USD stablecoin) uses P1SAT-derived addresses. The default keyID prefix is `'1sat'` (shared across 1Sat wallets). Omit `prefix` to use the default:

```ts
const { derivations } = await deriveDepositAddresses.execute(ctx, {
  startIndex: 0,
  count: 5,
});
const addresses = derivations.map(d => d.address);
// addresses for balance/history; derivations for sending
```

{% hint style="danger" %}
`sendMnee` requires `amount` as a **number** in decimal MNEE (`1.5` = $1.50), AND requires the full `derivations` array (not just addresses). Coerce user input with `Number(userInput)`.
{% endhint %}

See [Derivations](concepts/derivations.md) and [sendMnee](actions/send-mnee.md).

## High-level vs low-level

* **High-level**: `@1sat/actions` — use this 95% of the time. Opinionated, ergonomic, covers common operations.
* **Low-level**: BRC-100 `WalletInterface` methods on the `wallet` object — `wallet.createAction`, `wallet.createSignature`, `wallet.getPublicKey`, etc. Use when `@1sat/actions` does not cover the use case. See [Low-Level](low-level/blockchain-queries.md).

## Rules of thumb

1. Always check `result.error` before reading `result.txid`.
2. Always fetch BEEF via `getOrdinals` before any operation that spends an ordinal output.
3. `BEEF` may be `undefined` — check before using.
4. MNEE `sendMnee.amount` MUST be a `number` in decimal MNEE, AND `sendMnee` requires the `derivations` array (not just addresses).
5. MNEE addresses are derived via `deriveDepositAddresses` with the default `'1sat'` prefix (omit `prefix` to use the default).
6. BSV-21 amounts are **`bigint | string`** in atomic units; tokenIds use **underscore** format `txid_vout` (not dot). BSV-21 recipients use a `Destination` object (typically `{ address: '...' }`), not a bare address string.
7. Outpoints are `txid.vout` format (dot, not colon).
8. Wrap calls in try/catch even if you check `result.error` — network errors throw.
9. Key wallet data by `identityKey` from `useWallet` to avoid cross-account cache leakage.
10. When in doubt, the source of truth is the per-action page here in these docs.

## Common errors to handle gracefully

| Error | Meaning | What to do |
|-------|---------|------------|
| `user-rejected` | User declined the wallet prompt | Surface friendly message; allow retry |
| `storage-payment-failed` | User needs more BSV for storage costs | Direct them to top up |
| `insufficient-funds` | Not enough BSV in `default` basket | Show balance + amount diff |
| `not-connected` | Wallet not connected | Call `connect()` |

Full catalog in [Errors](reference/errors.md).

## What you should NOT do

* Do not write code that talks to `window.yours` — that is the legacy injected provider and is being phased out. Use `@1sat/actions`. See [Migration](migration/legacy-provider.md).
* Do not cache balances or ordinals without keying by `identityKey` — they leak across accounts.
* Do not assume `BEEF` is available — always check.
* Do not pass strings where numbers are expected (MNEE) or vice versa (BSV-21).

## Next

* [Quickstart](quickstart.md) — runnable boilerplate
* [Actions index](README.md#actions) — find the operation you need
* [Cookbook](cookbook/mint-and-list-ordinal.md) — task-oriented recipes
