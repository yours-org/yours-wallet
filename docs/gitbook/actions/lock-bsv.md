---
description: Lock BSV until a specified block height.
icon: lock
---

# lockBsv

**Package:** `@1sat/actions`
**Category:** Locks

## Signature

```ts
lockBsv.execute(ctx: OneSatContext, input: LockBsvInput): Promise<LockBsvResult>
```

## Input

```ts
interface LockBsvInput {
  requests: Array<{
    satoshis: number;  // amount to lock — integer
    until: number;     // BLOCK HEIGHT (not timestamp) at which it unlocks
  }>;
}
```

## Output

```ts
interface LockBsvResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Sufficient BSV in `default` basket

## Permission prompts

- `createAction`

## Example

```tsx
import { lockBsv } from '@1sat/actions';

const result = await lockBsv.execute(ctx, {
  requests: [
    { satoshis: 100000, until: 900000 },
  ],
});
if (result.error) throw new Error(result.error);
console.log('Locked in:', result.txid);
```

## Common pitfalls

{% hint style="danger" %}
`until` is a **block height**, NOT a Unix timestamp. Confusing the two is the most common bug. At ~10 min per block, 900000 - currentHeight gives the approximate wait in minutes.
{% endhint %}

{% hint style="warning" %}
`satoshis` must be an integer. Multiple `requests` in one call share a single transaction.
{% endhint %}

{% hint style="info" %}
Locked BSV is not spendable until `until`. The user can [unlockBsv](./unlock-bsv.md) once the chain reaches that height.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `insufficient-funds` | Not enough BSV |
| `invalid-amount` | Non-integer satoshis or non-positive |
| `invalid-height` | `until` not a positive integer |

## Related

- [unlockBsv](./unlock-bsv.md)
- [getLockData](./get-lock-data.md)
