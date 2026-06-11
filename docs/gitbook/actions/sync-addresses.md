---
description: Derive P1SAT addresses, fetch new outputs from the indexer, and internalize them into the wallet.
icon: arrows-rotate
---

# syncAddresses

**Package:** `@1sat/actions`
**Category:** Sync

Derives BRC-29-style deposit addresses under P1SAT, scans the 1sat-stack indexer for new outputs at those addresses, classifies them, and internalizes them into the wallet's local state.

## Signature

```ts
syncAddresses.execute(ctx: OneSatContext, input: SyncAddressesInput): Promise<SyncAddressesResult>
```

## Input

```ts
interface SyncAddressesInput {
  /** keyID prefix. Defaults to '1sat' — same default as deriveDepositAddresses. */
  prefix?: string;
  /** First address index to derive. Default 0. */
  startIndex?: number;
  /** Number of addresses to derive. Default 1. */
  count?: number;
  /** Optional progress callback for UI consumers */
  onProgress?: (progress: SyncProgress) => void;
}
```

## Output

```ts
interface SyncAddressesResult {
  /** Transactions successfully internalized */
  processed: number;
  /** Transactions that failed to internalize */
  failed: number;
  /** Last reorg-safe indexer score — pass as fromScore on next call (when supported) */
  lastScore: number;
  /** Addresses that were synced */
  addresses: string[];
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- `getPublicKey` (new derivations)
- `internalizeAction` (per new transaction internalized)

## Example

Default prefix, scan first 5 addresses:

```tsx
import { syncAddresses } from '@1sat/actions';

const result = await syncAddresses.execute(ctx, { count: 5 });
console.log(`Processed ${result.processed} new txs, ${result.failed} failed`);
```

With progress UI:

```tsx
const result = await syncAddresses.execute(ctx, {
  count: 10,
  onProgress: (p) => updateProgressBar(p),
});
```

## Use cases

- Periodic background sync to catch new MNEE / BSV-21 / ordinal receipts
- On wallet load, ensure the local state reflects on-chain
- After an external `signedOut → reconnect` cycle

## Common pitfalls

{% hint style="info" %}
Omit `prefix` to use the default `'1sat'`. This matches `deriveDepositAddresses`'s default, so balance / history calls keyed to those addresses stay consistent.
{% endhint %}

{% hint style="warning" %}
A larger `count` scans more addresses but uses more permission prompts and indexer load. Tune based on expected receive volume.
{% endhint %}

## Related

- [deriveDepositAddresses](./derive-deposit-addresses.md)
- [getMneeBalance](./get-mnee-balance.md)
- [getMneeHistory](./get-mnee-history.md)
- [Concept: Derivations](../concepts/derivations.md)
