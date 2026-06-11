---
description: Buy a listed ordinal at the listing's price.
icon: cart-shopping
---

# purchaseOrdinal

**Package:** `@1sat/actions`
**Category:** Marketplace

## Signature

```ts
purchaseOrdinal.execute(ctx: OneSatContext, input: PurchaseOrdinalInput): Promise<PurchaseOrdinalResult>
```

## Input

```ts
interface PurchaseOrdinalInput {
  outpoint: string;  // listing outpoint, "txid.vout"
}
```

## Output

```ts
interface PurchaseOrdinalResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Sufficient BSV in `default` basket to cover the listing's price + fees
- The listing must still be active (not already purchased or cancelled)

## Permission prompts

- `createAction`

## Example

```tsx
import { purchaseOrdinal } from '@1sat/actions';

const result = await purchaseOrdinal.execute(ctx, {
  outpoint: 'abc123...def.0',
});
if (result.error) throw new Error(result.error);
console.log('Purchased in txid:', result.txid);
```

## Common pitfalls

{% hint style="warning" %}
`outpoint` is `txid.vout` (dot, not colon). The wallet does not validate the outpoint exists before prompting — a typo will produce an `output-not-found` error.
{% endhint %}

{% hint style="info" %}
Listings can be sniped — between when your UI shows the listing and when the user confirms, someone else may have bought or the seller may have cancelled. Handle `not-found` and `already-spent` gracefully.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `insufficient-funds` | Not enough BSV to cover the price + fees |
| `not-found` | Listing outpoint does not exist |
| `already-spent` | Listing was already purchased or cancelled |

## Related

- [listOrdinal](./list-ordinal.md)
- [cancelListing](./cancel-listing.md)
- [getOrdinals](./get-ordinals.md)
