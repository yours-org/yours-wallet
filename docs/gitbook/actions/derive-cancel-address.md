---
description: Internal helper for deriving the cancel address of an OrdLock listing — not currently exposed as an action.
icon: key
---

# deriveCancelAddress

{% hint style="warning" %}
**Status: internal**. `deriveCancelAddress` is implemented inside the `@1sat/actions` ordinals module as `deriveCancelAddressInternal` and is used by `listOrdinal` to build the OrdLock script. It is NOT exported as a public action — you cannot call `deriveCancelAddress.execute(ctx, ...)` today.

If you need to preview the cancel-authorized address for a listing in your UI, you have two options:

1. Use [cancelListing](./cancel-listing.md) directly — it derives the cancel key internally and signs.
2. Wait for the SDK to expose this as a first-class action (track the `@1sat/actions` releases).
{% endhint %}

## What it does internally

When you call [listOrdinal](./list-ordinal.md), the SDK:

1. Derives a fresh cancel key from the wallet's identity (under the P1SAT cancel protocol).
2. Builds an OrdLock script that allows EITHER a buyer paying the price OR the cancel-key holder to spend.
3. Locks the ordinal into that script.

`cancelListing` later reverses the lock by signing with the same derived cancel key.

## Alternatives for UI

If your dApp needs to display "your listings" filtered by ownership:

- Query `wallet.listOutputs({ basket: '<ordlock-basket>', includeTags: true })` and filter to listings where the wallet has the cancel key (i.e., listings you created). The wallet only tracks listings it can cancel.
- Or just call `cancelListing` and let it fail with `not-lister` if the wallet does not control the cancel key.

## Related

- [listOrdinal](./list-ordinal.md)
- [cancelListing](./cancel-listing.md)
- [purchaseOrdinal](./purchase-ordinal.md)
