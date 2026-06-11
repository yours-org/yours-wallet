---
description: Mint a single item into an existing collection, optionally with traits, rank, and attachments.
icon: square-plus
---

# mintCollectionItem

**Package:** `@1sat/actions`
**Category:** Collections

## Signature

```ts
mintCollectionItem.execute(ctx: OneSatContext, input: MintCollectionItemInput): Promise<MintCollectionItemOutput>
```

## Input

```ts
import type { CollectionItemAttachment, CollectionItemTrait } from '@1sat/types';

interface MintCollectionItemInput {
  /** Base64-encoded item artwork */
  base64Content: string;
  /** MIME type of the artwork */
  contentType: string;
  /** Item name */
  name: string;
  /** Collection origin outpoint: "<txid>_<vout>" of the parent collection */
  collectionId: string;
  /** Optional mint number within the collection */
  mintNumber?: number;
  /** Optional rank within the collection */
  rank?: number;
  /** Optional item traits */
  traits?: CollectionItemTrait[];
  /** Optional file attachments */
  attachments?: CollectionItemAttachment[];
  /** MAP `app` field. Default: '1sat-wallet'. */
  app?: string;
}
```

## Output

```ts
interface MintCollectionItemOutput {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Parent collection already minted via [mintCollection](./mint-collection.md)
- Parent has remaining capacity (under its `quantity` cap)

## Permission prompts

- `createAction`

## Example

Minimal:

```tsx
import { mintCollectionItem } from '@1sat/actions';

const result = await mintCollectionItem.execute(ctx, {
  name: 'Item #1',
  collectionId: 'parentTxid_0',
  base64Content: itemPngBase64,
  contentType: 'image/png',
});
if (result.error) throw new Error(result.error);
```

With traits, mint number, and rank:

```tsx
const result = await mintCollectionItem.execute(ctx, {
  name: 'Item #42',
  collectionId: 'parentTxid_0',
  base64Content: itemPngBase64,
  contentType: 'image/png',
  mintNumber: 42,
  rank: 87,
  traits: [
    { name: 'background', value: 'blue' },
    { name: 'hat', value: 'top' },
  ],
});
```

## Common pitfalls

{% hint style="warning" %}
`collectionId` uses **underscore** format `txid_vout` (matches what `mintCollection` returns).
{% endhint %}

{% hint style="warning" %}
The mint fails if the collection has hit its `quantity` cap. There is no client-side preflight — the wallet validates server-side.
{% endhint %}

## Errors

| Code                 | Cause                                            |
| -------------------- | ------------------------------------------------ |
| `user-rejected`      | User denied the wallet prompt                    |
| `collection-full`    | Parent collection has reached its `quantity` cap |
| `not-found`          | `collectionId` does not exist                    |
| `insufficient-funds` | Not enough BSV                                   |

## Related

- [mintCollection](./mint-collection.md)
- [inscribe](./inscribe.md)
- [transferOrdinals](./transfer-ordinals.md)
