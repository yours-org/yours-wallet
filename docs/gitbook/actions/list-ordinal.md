---
description: List an ordinal for sale via OrdLock at a fixed BSV price.
icon: tag
---

# listOrdinal

**Package:** `@1sat/actions`
**Category:** Marketplace

## Signature

```ts
listOrdinal.execute(ctx: OneSatContext, input: ListOrdinalInput): Promise<ListOrdinalResult>
```

## Input

```ts
interface ListOrdinalInput {
  ordinal: WalletOutput; // output from getOrdinals
  inputBEEF: number[]; // Array.from(BEEF) from getOrdinals
  price: number; // listing price in SATOSHIS
  payAddress: string; // address that receives BSV when purchased
}
```

## Output

```ts
interface ListOrdinalResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- You have called `getOrdinals` first to fetch the ordinal + BEEF
- The ordinal is currently in the wallet (not already listed or transferred)

## Permission prompts

- `createAction`

## Example

```tsx
import { getOrdinals, listOrdinal } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
if (!BEEF) throw new Error('No BEEF returned');

const ordinal = outputs.find((o) => o.outpoint === targetOutpoint);
if (!ordinal) throw new Error('Ordinal not found');

const result = await listOrdinal.execute(ctx, {
  ordinal,
  inputBEEF: Array.from(BEEF),
  price: 100000, // 0.001 BSV
  payAddress: '1Seller...',
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
- [getOrdinals](./get-ordinals.md) — required first call
- [Cookbook: Mint & List Ordinal](../cookbook/mint-and-list-ordinal.md)
