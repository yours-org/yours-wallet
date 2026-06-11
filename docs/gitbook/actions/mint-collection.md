---
description: Mint a new collection parent inscription with optional traits, rarity labels, and royalties.
icon: layer-group
---

# mintCollection

**Package:** `@1sat/actions`
**Category:** Collections

## Signature

```ts
mintCollection.execute(ctx: OneSatContext, input: MintCollectionInput): Promise<MintCollectionOutput>
```

## Input

```ts
import type { CollectionTraits, RarityLabels, Royalty } from '@1sat/types';

interface MintCollectionInput {
  /** Base64-encoded collection artwork (icon/image) */
  base64Content: string;
  /** MIME type of the artwork */
  contentType: string;
  /** Collection name */
  name: string;
  /** Collection description */
  description: string;
  /** Total number of items in the collection */
  quantity: number;
  /** Optional trait definitions */
  traits?: CollectionTraits;
  /** Optional rarity labels */
  rarityLabels?: RarityLabels;
  /** Optional royalty configuration */
  royalties?: Royalty[];
  /** MAP `app` field. Default: '1sat-wallet'. */
  app?: string;
}
```

## Output

```ts
interface MintCollectionOutput {
  txid?: string;
  /** Origin outpoint of the collection: "<txid>_0" — use as collectionId for items */
  collectionId?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Sufficient BSV for inscription cost

## Permission prompts

- `createAction`

## Example

Minimal:

```tsx
import { mintCollection } from '@1sat/actions';

const result = await mintCollection.execute(ctx, {
  name: 'My Collection',
  description: 'A collection of generative art.',
  base64Content: coverPngBase64,
  contentType: 'image/png',
  quantity: 100,
});
if (result.error) throw new Error(result.error);

console.log('Collection ID:', result.collectionId);
// pass result.collectionId to mintCollectionItem
```

With traits, rarity, and royalties:

```tsx
const result = await mintCollection.execute(ctx, {
  name: 'My Collection',
  description: '...',
  base64Content: coverPngBase64,
  contentType: 'image/png',
  quantity: 1000,
  traits: {
    background: { values: ['blue', 'red', 'green'] },
    hat: { values: ['none', 'top', 'baseball'] },
  },
  rarityLabels: { common: 0.7, rare: 0.25, legendary: 0.05 },
  royalties: [{ address: '1Creator...', percentage: 0.025 }],
  app: 'my-marketplace',
});
```

## Common pitfalls

{% hint style="warning" %}
`base64Content` must already be base64-encoded. Use `Utils.toBase64` from `@bsv/sdk` for binary content.
{% endhint %}

{% hint style="info" %}
`collectionId` returned in the result uses **underscore** format `txid_vout` (matches the BSV-21 convention). Pass this directly to [mintCollectionItem](./mint-collection-item.md).
{% endhint %}

{% hint style="warning" %}
`quantity` is the cap. Subsequent `mintCollectionItem` calls referencing this collection will fail once the cap is hit.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `insufficient-funds` | Not enough BSV |
| `invalid-content` | Bad base64 |

## Related

- [mintCollectionItem](./mint-collection-item.md)
- [inscribe](./inscribe.md)
