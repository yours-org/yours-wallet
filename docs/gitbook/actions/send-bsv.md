---
description: Send BSV. Each request can target an address, paymail, custom script, or include OP_RETURN data or an inscription.
icon: paper-plane
---

# sendBsv

**Package:** `@1sat/actions`
**Category:** Payments

## Signature

```ts
sendBsv.execute(ctx: OneSatContext, input: SendBsvInput): Promise<SendBsvResponse>
```

## Input

```ts
interface SendBsvInput {
  requests: SendBsvRequest[];
}

interface SendBsvRequest {
  /** Destination address (P2PKH) */
  address?: string;
  /** Destination paymail */
  paymail?: string;
  /** Amount in satoshis */
  satoshis: number;
  /** Custom locking script (hex) — alternative to address/paymail */
  script?: string;
  /** OP_RETURN data — array of hex/utf8 chunks */
  data?: string[];
  /** Embedded inscription */
  inscription?: {
    base64Data: string;
    mimeType: string;
    map?: Record<string, string>;
  };
}
```

Each `SendBsvRequest` must specify destination via at least one of `address`, `paymail`, or `script`. `data` and `inscription` are optional extras.

## Output

```ts
interface SendBsvResponse {
  txid?: string;
  tx?: number[];
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Sufficient spendable BSV in the `default` basket

## Permission prompts

- `createAction`

## Example

Simple — send to two addresses in one tx:

```tsx
import { sendBsv } from '@1sat/actions';

const result = await sendBsv.execute(ctx, {
  requests: [
    { address: '1Address...', satoshis: 50000 },
    { address: '1Another...', satoshis: 25000 },
  ],
});
if (result.error) throw new Error(result.error);
console.log('txid:', result.txid);
```

Send to a paymail:

```tsx
const result = await sendBsv.execute(ctx, {
  requests: [{ paymail: 'alice@example.com', satoshis: 100000 }],
});
```

Send with embedded OP_RETURN data:

```tsx
const result = await sendBsv.execute(ctx, {
  requests: [{
    address: '1Receiver...',
    satoshis: 1000,
    data: ['my-app', 'event', 'click'],
  }],
});
```

Send with an embedded inscription:

```tsx
const result = await sendBsv.execute(ctx, {
  requests: [{
    address: '1Receiver...',
    satoshis: 1,
    inscription: {
      base64Data: pngBase64,
      mimeType: 'image/png',
      map: { app: 'my-app', type: 'attachment' },
    },
  }],
});
```

## Common pitfalls

{% hint style="warning" %}
`satoshis` must be an integer. Convert user input with `Math.floor(Number(input))` if necessary.
{% endhint %}

{% hint style="info" %}
Multiple `requests` share one transaction — cheaper than calling `sendBsv` repeatedly.
{% endhint %}

{% hint style="info" %}
For pure inscriptions (where there is no separate payment), prefer [inscribe](./inscribe.md). Use `sendBsv` with `inscription` when you want to attach an inscription to a normal payment.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `insufficient-funds` | Not enough BSV |
| `invalid-address` | Malformed `address` |
| `paymail-resolution-failed` | `paymail` did not resolve |
| `storage-payment-failed` | Wallet remote storage needs top-up |

## Related

- [sendAllBsv](./send-all-bsv.md)
- [inscribe](./inscribe.md)
- [listOutputs](./list-outputs.md)
- [Concept: Actions & Context](../concepts/actions-and-context.md)
- [Reference: Errors](../reference/errors.md)
