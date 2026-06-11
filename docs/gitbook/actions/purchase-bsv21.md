---
description: Buy BSV-21 tokens from a listed OrdLock output.
icon: cart-shopping
---

# purchaseBsv21

**Package:** `@1sat/actions`
**Category:** BSV-21

## Signature

```ts
purchaseBsv21.execute(ctx: OneSatContext, input: PurchaseBsv21Request): Promise<TokenOperationResponse>
```

## Input

```ts
interface PurchaseBsv21Request {
  /** Token ID — txid_vout (UNDERSCORE) of the deploy transaction */
  tokenId: string;
  /** Outpoint of the listed token UTXO (OrdLock containing BSV-21) */
  outpoint: string;
  /** Amount of tokens in the listing — bigint or string */
  amount: bigint | string;
  /** Optional marketplace fee address */
  marketplaceAddress?: string;
  /** Optional marketplace fee rate (0-1) */
  marketplaceRate?: number;
}
```

## Output

```ts
interface TokenOperationResponse {
  txid?: string;
  tx?: number[];
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Sufficient BSV in `default` basket to cover the price + fees
- The listing must still be active

## Permission prompts

- `createAction`

## Example

```tsx
import { purchaseBsv21 } from '@1sat/actions';

const result = await purchaseBsv21.execute(ctx, {
  tokenId: 'abc123...def_0',
  outpoint: 'listingTxid.0',
  amount: 1000n,
});
if (result.error) throw new Error(result.error);
```

With marketplace fee:

```tsx
const result = await purchaseBsv21.execute(ctx, {
  tokenId: 'abc123...def_0',
  outpoint: 'listingTxid.0',
  amount: 1000n,
  marketplaceAddress: '1Marketplace...',
  marketplaceRate: 0.025,   // 2.5%
});
```

## Common pitfalls

{% hint style="danger" %}
`amount` is `bigint | string` in atomic units — must match the listing's amount.
{% endhint %}

{% hint style="warning" %}
Format mismatch is the most common bug: `tokenId` uses **underscore** (`txid_vout`); `outpoint` uses **dot** (`txid.vout`).
{% endhint %}

{% hint style="info" %}
`marketplaceRate` must be in `[0, 1]`. A 2.5% fee is `0.025`, not `2.5`.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `insufficient-funds` | Not enough BSV to cover the price + fees |
| `not-found` | Listing outpoint does not exist |
| `already-spent` | Listing already purchased / cancelled |
| `invalid-token-id` | `tokenId` not in expected format |

## Related

- [sendBsv21](./send-bsv21.md)
- [getBsv21Balances](./get-bsv21-balances.md)
- [listTokens](./list-tokens.md)
