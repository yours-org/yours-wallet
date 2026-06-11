---
description: List spendable outputs from a basket. Low-level BRC-100 method exposed via the wallet object.
icon: list
---

# listOutputs

**Package:** `@bsv/sdk` (BRC-100 `WalletInterface`)
**Category:** Payments / Output Management

{% hint style="info" %}
`listOutputs` is a low-level BRC-100 method, not an `@1sat/actions` wrapper. Call it directly on the `wallet` object from `useWallet()`.
{% endhint %}

## Signature

```ts
wallet.listOutputs(input: ListOutputsInput): Promise<ListOutputsResult>
```

## Input

```ts
interface ListOutputsInput {
  basket: string;                       // e.g. 'default'
  tags?: string[];                      // optional filter
  includeTags?: boolean;                // include each output's tags in the result
  include?: 'locking scripts';          // include locking scripts (larger payload)
  limit?: number;
}
```

## Output

```ts
interface ListOutputsResult {
  outputs: WalletOutput[];
}

interface WalletOutput {
  outpoint: string;        // "txid.vout"
  satoshis: number;
  spendable: boolean;
  tags?: string[];
  labels?: string[];
  lockingScript?: string;  // when include: 'locking scripts'
  customInstructions?: string;
}
```

## Preconditions

- Connected wallet (`useWallet().status === 'connected'`)

## Permission prompts

- Typically none (read-only on the user's own outputs)

## Example

Basic balance lookup:

```tsx
import { useWallet } from '@1sat/react';

const { wallet } = useWallet();

const { outputs } = await wallet.listOutputs({
  basket: 'default',
  limit: 1000,
});
const totalSats = outputs.reduce((sum, o) => sum + o.satoshis, 0);
```

With locking scripts (for inspection or custom signing):

```tsx
const { outputs } = await wallet.listOutputs({
  basket: 'default',
  include: 'locking scripts',
  limit: 200,
});
outputs.forEach(o => console.log(o.outpoint, o.lockingScript));
```

Filter by tag:

```tsx
const { outputs } = await wallet.listOutputs({
  basket: 'ord',
  tags: ['type:image/png'],
  includeTags: true,
  limit: 100,
});
```

## Common pitfalls

{% hint style="warning" %}
Default `limit` may be small. Set explicitly for large baskets, and paginate by re-querying after some outputs are spent.
{% endhint %}

{% hint style="info" %}
`include: 'locking scripts'` increases response size significantly. Only request when you actually need the scripts.
{% endhint %}

## Related

- [Output Management (low-level)](../low-level/output-management.md) — also covers `relinquishOutput`
- [Concept: Baskets & Tags](../concepts/baskets-and-tags.md)
- [getOrdinals](./get-ordinals.md) — high-level wrapper that also returns BEEF
- [Types: WalletOutput](../reference/types.md)
