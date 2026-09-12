---
description: List an ordinal for sale via OrdLock v2 at a fixed BSV price.
icon: tag
---

# listOrdinal

{% hint style="info" %}
New listings use OrdLock v2 via `sellOrdinal` (`@1sat/actions`). Buy and cancel of v1 (`ordlock`) and v2 (`ordlock2`) listings stay enabled. See `docs/ordlock-listings.md` in the repo.
{% endhint %}

**Package:** `@1sat/actions`
**Category:** Marketplace

## Signature

```ts
sellOrdinal.execute(ctx: OneSatContext, input: SellOrdinalRequest): Promise<OrdinalOperationResponse>
```

## Input

```ts
interface SellOrdinalRequest {
  id: string; // tracking id from listOrdinals (see readAssetIdTag)
  price: number; // listing price in SATOSHIS
  payAddress?: string; // payment receive address; defaults to P1SAT `1sat 0`
  map?: Record<string, string>; // optional MAP metadata on the listing output
}
```

## Output

```ts
interface OrdinalOperationResponse {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- You have called `listOrdinals` first to fetch the ordinal and its tracking id
- The ordinal is currently in the wallet (not already listed or transferred)

## Permission prompts

- `createAction`

## Example

```tsx
import { listOrdinals, sellOrdinal } from '@1sat/actions';
import { readAssetIdTag } from '@1sat/types';

const { outputs } = await listOrdinals.execute(ctx, { limit: 50, offset: 0 });
const output = outputs.find((o) => o.outpoint === targetOutpoint);
if (!output) throw new Error('Ordinal not found');

const id = readAssetIdTag(output.tags);
if (!id) throw new Error('Ordinal has no tracking id');

const result = await sellOrdinal.execute(ctx, {
  id,
  price: 100000, // 0.001 BSV
});
if (result.error) throw new Error(result.error);
console.log('Listed in txid:', result.txid);
```

## Common pitfalls

{% hint style="warning" %}
`price` is in satoshis, not BSV. `100000` = 0.001 BSV. Multiply by `1e8` if converting from BSV.
{% endhint %}

{% hint style="warning" %}
`payAddress` is where the buyer's BSV lands when the listing is purchased — NOT where the ordinal goes. Usually one of the seller's own addresses.
{% endhint %}

{% hint style="info" %}
The ordinal is moved to an OrdLock output. To take it back without selling, use [cancelListing](./cancel-listing.md).
{% endhint %}

## Errors

| Code              | Cause                                   |
| ----------------- | --------------------------------------- |
| `user-rejected`   | User denied the wallet prompt           |
| `no-beef`         | `inputBEEF` missing or invalid          |
| `not-found`       | Ordinal not in wallet (stale — refetch) |
| `invalid-address` | Malformed `payAddress`                  |
| `invalid-amount`  | Non-positive or non-integer `price`     |

## Related

- [purchaseOrdinal](./purchase-ordinal.md)
- [cancelListing](./cancel-listing.md)
- [deriveCancelAddress](./derive-cancel-address.md)
- [getOrdinals](./get-ordinals.md) — wallet inventory; call `listOrdinals` first for the tracking id
- [Cookbook: Mint & List Ordinal](../cookbook/mint-and-list-ordinal.md)
