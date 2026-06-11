---
description: Send a BSV-21 token to one or more recipients using the Destination type.
icon: paper-plane
---

# sendBsv21

**Package:** `@1sat/actions`
**Category:** BSV-21

## Signature

```ts
sendBsv21.execute(ctx: OneSatContext, input: SendBsv21Input): Promise<TokenOperationResponse>
```

## Input

```ts
import type { Destination } from '@1sat/types';

interface SendBsv21Input {
  /** Token ID — txid_vout (UNDERSCORE) format */
  tokenId: string;
  recipients: Array<{
    /** Amount to send — bigint or string of digits, in atomic units */
    amount: bigint | string;
    /** Where to lock the output — address, pubkey, or paymail (see Destination type) */
    destination: Destination;
  }>;
}
```

`Destination` is a tagged union from `@1sat/types`. The most common form is `{ address: '1...' }`.

## Output

```ts
interface TokenOperationResponse {
  txid?: string;
  tx?: number[];   // raw transaction bytes
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Sufficient token balance (check with [getBsv21Balances](./get-bsv21-balances.md))
- Small BSV reserve in `default` basket for the transaction fee

## Permission prompts

- `createAction`

## Example

```tsx
import { sendBsv21 } from '@1sat/actions';

const result = await sendBsv21.execute(ctx, {
  tokenId: 'abc123...def_0',
  recipients: [
    {
      amount: 1000n,                              // bigint
      destination: { address: '1Recipient...' },  // Destination
    },
  ],
});
if (result.error) throw new Error(result.error);
console.log('Sent in:', result.txid);
```

String amount (when integrating with UI input that gives you a string):

```tsx
const result = await sendBsv21.execute(ctx, {
  tokenId: 'abc123...def_0',
  recipients: [{ amount: '1000', destination: { address: '1...' } }],
});
```

## Common pitfalls

{% hint style="danger" %}
`amount` is `bigint | string` in **atomic units**. If the token has `dec: 6` and the user wants to send 1.5 tokens, pass `1500000n` (or `'1500000'`), NOT `1.5` or `'1.5'`.
{% endhint %}

{% hint style="warning" %}
`tokenId` uses **underscore** (`txid_vout`), not dot. The wallet returns it in this format from `getBsv21Balances`.
{% endhint %}

{% hint style="warning" %}
`destination` is a `Destination` object, not a bare address string. The most common form is `{ address: '...' }` but the type also supports `{ pubkey: '...' }` and paymail variants.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `insufficient-token-balance` | Not enough of the token |
| `insufficient-funds` | Not enough BSV for tx fee |
| `invalid-destination` | Malformed `destination` |
| `invalid-token-id` | `tokenId` not in expected `txid_vout` format |

## Related

- [getBsv21Balances](./get-bsv21-balances.md)
- [listTokens](./list-tokens.md)
- [purchaseBsv21](./purchase-bsv21.md)
- [Types](../reference/types.md)
