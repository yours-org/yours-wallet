---
description: How outputs are organized in BRC-100 wallets — basket buckets and string tags.
icon: basket-shopping
---

# Baskets & Tags

In a BRC-100 wallet, every output the user owns lives in a **basket** (a named bucket) and may carry one or more **tags** (string annotations).

## Baskets

A basket is just a string label. The standard basket is `default` and holds plain BSV outputs. Ordinals, tokens, and other special outputs live in dedicated baskets.

Query with `wallet.listOutputs`:

```tsx
const { outputs } = await wallet.listOutputs({
  basket: 'default',
  limit: 1000,
});
const totalSats = outputs.reduce((sum, o) => sum + o.satoshis, 0);
```

## Tags

Tags are string annotations on individual outputs. Ordinal outputs carry well-known tags:

| Tag                 | Meaning                                             |
| ------------------- | --------------------------------------------------- |
| `origin` (bare)     | This output IS the origin inscription               |
| `origin:<outpoint>` | Transfer — the tag's outpoint references the origin |
| `type:<mime>`       | Content type (e.g. `type:image/png`)                |
| `name:<string>`     | Friendly name                                       |

Use the tag value to build content URLs:

```tsx
import { ONESAT_MAINNET_CONTENT_URL } from '@1sat/actions';

const originTag = ord.tags?.find((t) => t.startsWith('origin:'));
const originOutpoint = originTag?.slice('origin:'.length) ?? ord.outpoint;
const url = `${ONESAT_MAINNET_CONTENT_URL}/${originOutpoint}`;
```

## Querying with tags

```tsx
const { outputs } = await wallet.listOutputs({
  basket: 'ord',
  tags: ['type:image/png'],
  includeTags: true,
  limit: 100,
});
```

`includeTags: true` causes each returned output to include its `tags` array.

## Getting locking scripts

By default `listOutputs` returns outputs without locking scripts (smaller payload). When you need them:

```tsx
const { outputs } = await wallet.listOutputs({
  basket: 'default',
  include: 'locking scripts',
  limit: 200,
});
// each output now has `lockingScript`
```

## Relinquishing outputs

To remove an output from a basket (e.g., garbage-collect spent UTXOs the wallet missed):

```tsx
await wallet.relinquishOutput({
  basket: 'my-basket',
  output: 'txid.vout',
});
```

## WalletOutput type

```ts
interface WalletOutput {
  outpoint: string; // "txid.vout"
  satoshis: number;
  spendable: boolean;
  tags?: string[];
  labels?: string[];
  lockingScript?: string; // when include: 'locking scripts'
  customInstructions?: string;
}
```

Full type docs in [Types](../reference/types.md).

## Related

- [Output Management](../low-level/output-management.md) — low-level `listOutputs` / `relinquishOutput`
- [getOrdinals](../actions/get-ordinals.md) — high-level wrapper that also returns BEEF
- [listOutputs (action)](../actions/list-outputs.md) — high-level UTXO listing
- [Types](../reference/types.md) — `WalletOutput` and tag conventions
