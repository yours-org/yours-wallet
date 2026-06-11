---
description: The createContext + action.execute(ctx, input) pattern used by every @1sat/actions call.
icon: bolt
---

# Actions & Context

`@1sat/actions` provides every high-level wallet operation. They all follow the same shape:

```ts
const result = await actionName.execute(ctx, input);
```

You build `ctx` once and reuse it.

## Creating a context

```tsx
import { createContext } from '@1sat/actions';
import { OneSatServices } from '@1sat/client';

const services = new OneSatServices('main');
const ctx = createContext(wallet, { chain: 'main', services });
```

* `wallet` is the BRC-100 `WalletInterface` from `useWallet()`.
* `chain` is `'main'` for BSV mainnet (test chain not currently supported by Yours).
* `services` is a `OneSatServices` instance from `@1sat/client` that handles backend lookups (UTXO scans, ORDFS, broadcast).

## The React pattern

Wrap the context creation in `useMemo` so it does not rebuild every render:

```tsx
import { useMemo } from 'react';
import { useWallet } from '@1sat/react';
import { createContext } from '@1sat/actions';
import { OneSatServices } from '@1sat/client';

const services = new OneSatServices('main');

function useOneSatContext() {
  const { wallet, status } = useWallet();
  return useMemo(() => {
    if (status !== 'connected' || !wallet) return null;
    return createContext(wallet, { chain: 'main', services });
  }, [wallet, status]);
}
```

Guard for `ctx === null` everywhere you use it.

## The return envelope

Most write-type actions return `{ txid?: string, error?: string, ... }`:

```ts
const result = await sendBsv.execute(ctx, { requests: [...] });
if (result.error) {
  // action-level error — user rejected, validation, etc.
  return;
}
// result.txid is now safe to read
```

Some actions return extra fields (`ticketId`, `BEEF`, `outputs`, `signature`, etc.) — see each action's page for its exact output type.

{% hint style="warning" %}
Always check `result.error` before reading other fields. Returning early on error keeps your control flow clean.
{% endhint %}

## Two-tier error handling

Errors arrive through **two channels** — the in-result `error` field and thrown exceptions. You need both:

```ts
try {
  const result = await sendBsv.execute(ctx, { requests: [...] });
  if (result.error) {
    console.error('Action error:', result.error);
    return;
  }
  console.log('Success:', result.txid);
} catch (err) {
  // Network / unexpected / wallet-level failure
  if ((err as any)?.code === 'storage-payment-failed') {
    // user needs more BSV for storage
  }
  console.error('Thrown:', err);
}
```

See [Errors](../reference/errors.md) for the full catalog.

## Action categories

Every action page follows the same template (signature, input, output, preconditions, permission prompts, example, pitfalls, errors, related).

The categories:

* Payments — [sendBsv](../actions/send-bsv.md), [sendAllBsv](../actions/send-all-bsv.md), [listOutputs](../actions/list-outputs.md)
* Ordinals — [getOrdinals](../actions/get-ordinals.md), [transferOrdinals](../actions/transfer-ordinals.md), [inscribe](../actions/inscribe.md), [burnOrdinals](../actions/burn-ordinals.md)
* Marketplace — [listOrdinal](../actions/list-ordinal.md), [purchaseOrdinal](../actions/purchase-ordinal.md), [cancelListing](../actions/cancel-listing.md), [deriveCancelAddress](../actions/derive-cancel-address.md)
* Collections — [mintCollection](../actions/mint-collection.md), [mintCollectionItem](../actions/mint-collection-item.md)
* BSV-21 — [getBsv21Balances](../actions/get-bsv21-balances.md), [sendBsv21](../actions/send-bsv21.md), [listTokens](../actions/list-tokens.md), [purchaseBsv21](../actions/purchase-bsv21.md)
* MNEE — [deriveDepositAddresses](../actions/derive-deposit-addresses.md), [sendMnee](../actions/send-mnee.md), [getMneeBalance](../actions/get-mnee-balance.md), and more
* Identity — [getProfile](../actions/get-profile.md), [updateProfile](../actions/update-profile.md), [publishIdentity](../actions/publish-identity.md)
* Locks — [lockBsv](../actions/lock-bsv.md), [unlockBsv](../actions/unlock-bsv.md), [getLockData](../actions/get-lock-data.md)
* Signing — [signBsm](../actions/sign-bsm.md), [encrypt-decrypt](../actions/encrypt-decrypt.md)
* OpNS — [opnsRegister](../actions/opns-register.md), [opnsDeregister](../actions/opns-deregister.md)
* Sweep — [sweepBsv](../actions/sweep-bsv.md), [sweepOrdinals](../actions/sweep-ordinals.md), [sweepBsv21](../actions/sweep-bsv21.md)

Full index in the [SUMMARY](../SUMMARY.md) sidebar.

## When to bypass actions

For use cases not covered by `@1sat/actions`, call the BRC-100 `wallet.*` methods directly. See [BRC-100](brc-100.md) and the [Low-Level docs](../low-level/blockchain-queries.md).

## Related

* [BRC-100](brc-100.md) — the underlying interface
* [BEEF](beef.md) — required by spend-side actions
* [Permissions](permissions.md) — every action may prompt
* [Errors](../reference/errors.md) — error code catalog
