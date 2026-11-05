---
description: Send 1Color (BRC-162) tokens to a BRC-169 handle — a BRC-177 handoff the recipient's wallet collects from its messagebox.
icon: paper-plane
---

# send1Color

**Package:** `@1sat/actions`
**Category:** 1Color

## Signature

```ts
send1Color.execute(ctx: OneSatContext, input: Send1ColorInput): Promise<Send1ColorResult>
```

## Input

```ts
interface Send1ColorInput {
  /** The asset id, `<txid>_<vout>` */
  assetId: string;
  /** Amount in atomic units */
  amount: bigint | string;
  /** BRC-169 handle: `@handle@domain` or `handle@domain` */
  destination: { handle: string };
  /** BRC-177 `nosend expiry seconds` for the handoff (default one year) */
  expirySeconds?: number;
  /** Optional free text carried in the delivery */
  memo?: string;
}
```

## Output

```ts
interface Send1ColorResult {
  txid?: string;
  /** AtomicBEEF of the send */
  tx?: number[];
  /** Set when the envelope reached the handle's messagebox */
  delivered?: 'envelope';
  /** Messagebox message id */
  messageId?: string;
  error?: string;
}
```

## What it does

1. Resolves the handle to the recipient's identity key and messagebox.
2. Derives the recipient's key under the asset's `p color` protocol with fresh random prefix and suffix, and builds the 1Color value output.
3. One `createAction` with that output, the plan (one `transfer`), the BRC-177 label `p nosend expiry seconds <n>`, `noSend: true` and `randomizeOutputs: false`. The wallet's color module selects token inputs, splits to the exact amount if it must, signs after the user's consent, and holds the transaction unsent.
4. Delivers a signed, encrypted envelope to the recipient's `transaction-delivery` box containing the transaction and a `basket insertion` receipt into the asset's basket. The recipient's wallet submits the transaction to the overlay and internalizes it (Yours does this automatically; see [Receiving 1Color](./receive-1color.md)).

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain, services })`
- Enough of the asset available (see [1Color balances](./get-1color-balances.md))
- Small BSV reserve in the `default` basket for the fee
- An overlay for the asset (see [1Color Tokens](../concepts/one-color.md#overlays))
- The recipient has a registered BRC-169 handle with a messagebox

## Permission prompts

- `createAction` — the 1Color send prompt: asset, amount, kept change, fee and the signatures released
- `getPublicKey` on first use of the `p color` protocol for this asset
- Signing and encrypting the delivery envelope (`createSignature`, `encrypt`) on first use

## Example

```tsx
import { send1Color } from '@1sat/actions';

const result = await send1Color.execute(ctx, {
  assetId: 'abc123...def_0',
  amount: '150000', // 1500.00 with dec: 2
  destination: { handle: '@alice@example.com' },
  memo: 'Thanks for lunch',
});

if (result.error?.startsWith('delivery-failed')) {
  // The handoff exists as a noSend action in the wallet (result.txid, result.tx).
  // Retry delivery, or abort it so the tokens are released:
  await ctx.wallet.abortAction({ reference: /* the action's reference */ });
} else if (result.error) {
  throw new Error(result.error);
}
console.log('Delivered', result.txid, 'as message', result.messageId);
```

## Common pitfalls

{% hint style="danger" %}
`amount` is in **atomic units**. Read `dec` from the asset's deploy (see [1Color balances](./get-1color-balances.md)) before converting user input.
{% endhint %}

{% hint style="warning" %}
The only destination is a **handle**. There is no address or public-key form: the recipient's wallet must learn the derivation facts through the delivery, and that is what the handle's messagebox is for.
{% endhint %}

{% hint style="warning" %}
`delivery-failed` is not a failed send. The signed handoff already reserves the tokens (`color_state_reserved`) until it expires or is aborted. Retry delivery, or abort the action.
{% endhint %}

{% hint style="info" %}
The recipient sees the tokens once their wallet collects its messagebox and the overlay admits the transaction. In Yours that happens within about a minute of the wallet being open.
{% endhint %}

## Errors

| Code                      | Cause                                                                        |
| ------------------------- | ---------------------------------------------------------------------------- |
| `user-rejected`           | User denied the prompt                                                       |
| `invalid-asset-id`        | `assetId` is not `<txid>_<vout>`                                             |
| `amount-must-be-positive` | Zero or negative amount                                                      |
| `no-transaction`          | The wallet returned no signed transaction                                    |
| `delivery-failed: <why>`  | Signed, but the envelope did not reach the messagebox; `txid` and `tx` set   |
| (thrown message)          | Handle did not resolve; not enough tokens; overlay refused or not configured |

## Related

- [1Color Tokens](../concepts/one-color.md)
- [1Color balances](./get-1color-balances.md)
- [Receiving 1Color](./receive-1color.md)
- [deploy1Color](./deploy-1color.md)
