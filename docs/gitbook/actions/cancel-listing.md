---
description: Cancel an OrdLock listing and recover the ordinal.
icon: ban
---

# cancelListing

**Package:** `@1sat/actions`
**Category:** Marketplace

## Signature

```ts
cancelListing.execute(ctx: OneSatContext, input: CancelListingInput): Promise<CancelListingResult>
```

## Input

```ts
interface CancelListingInput {
  listing: WalletOutput;  // the OrdLock listing output, from getOrdinals
  inputBEEF: number[];    // Array.from(BEEF) from getOrdinals
}
```

## Output

```ts
interface CancelListingResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- You have called `getOrdinals` first to fetch the listing + BEEF
- You are the original lister (only your cancel key can unlock the listing)

## Permission prompts

- `createAction`

## Example

```tsx
import { getOrdinals, cancelListing } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
if (!BEEF) throw new Error('No BEEF returned');

const listing = outputs.find(o => o.outpoint === listingOutpoint);
if (!listing) throw new Error('Listing not found');

const result = await cancelListing.execute(ctx, {
  listing,
  inputBEEF: Array.from(BEEF),
});
if (result.error) throw new Error(result.error);
console.log('Cancelled in txid:', result.txid);
```

## Common pitfalls

{% hint style="warning" %}
Only the original lister can cancel. The cancel script is signed by a key derived deterministically from the lister — others cannot reproduce it. Use [deriveCancelAddress](./derive-cancel-address.md) to preview which address that is.
{% endhint %}

{% hint style="info" %}
After cancel, the ordinal returns to the lister's wallet in the ordinals basket. Re-list with [listOrdinal](./list-ordinal.md).
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `no-beef` | `inputBEEF` missing or invalid |
| `not-found` | Listing not in wallet (already cancelled/purchased — refetch) |
| `not-lister` | Wallet does not control the cancel key |

## Related

- [listOrdinal](./list-ordinal.md)
- [purchaseOrdinal](./purchase-ordinal.md)
- [deriveCancelAddress](./derive-cancel-address.md)
- [getOrdinals](./get-ordinals.md)
