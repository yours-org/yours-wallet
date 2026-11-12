---
description: Receive 1Color tokens — collect the wallet's transaction-delivery messagebox with syncTransactionInbox, or internalize a delivery directly.
icon: inbox
---

# Receiving 1Color

**Package:** `@1sat/actions`
**Category:** 1Color

A 1Color send is a handoff: the sender signs but does not broadcast, and delivers the transaction with a **receipt** to the recipient's messagebox (BRC-232). Receiving means collecting that box, submitting the transaction to the asset's overlay and internalizing the received output.

{% hint style="success" %}
Yours Wallet collects its own `transaction-delivery` box about once a minute while the extension is running. Tokens sent to a user's handle show up in the wallet without any dApp involvement. Use the action below only when **your dApp's own wallet** receives tokens.
{% endhint %}

## syncTransactionInbox

```ts
syncTransactionInbox.execute(ctx: OneSatContext, input: SyncTransactionInboxInput): Promise<SyncTransactionInboxResult>
```

### Input

```ts
interface SyncTransactionInboxInput {
  /** MessageBox server URL (default: "https://messagebox.1sat.app") */
  messageboxUrl?: string;
  /** Overlay base URL used for every 1Color asset received */
  overlay?: string;
  /** Overlay per asset; wins over `overlay`. Undefined leaves the message unacknowledged */
  overlayFor?: (assetId: string) => Promise<string | undefined>;
}
```

### Output

```ts
interface SyncTransactionInboxResult {
  received: Array<{
    messageId: string;
    txid: string;
    /** Sender identity key, hex */
    sender: string;
    /** 1Color assets received, `<txid>_<vout>` */
    assetIds: string[];
    satoshis?: number; // handle payments only
    memo?: string; // handle payments only
  }>;
  /** Messages left unacknowledged, with a reason */
  skipped: Array<{ messageId: string; reason: string }>;
  error?: string;
}
```

### What it does

For each message in the box it verifies the envelope's signature, decrypts the content, submits each 1Color transaction to `tm_color_<assetId>` at that asset's overlay, requires the overlay to admit the received output, then calls `internalizeAction` once with every entry. A message is internalized whole or not at all, and acknowledged only after success. The same box also carries BRC-29 handle payments, which are internalized as wallet payments.

### Example

```tsx
import { syncTransactionInbox } from '@1sat/actions';

const result = await syncTransactionInbox.execute(ctx, {
  overlayFor: async (assetId) => overlayByAsset[assetId] ?? 'https://testnet.openex.dev',
});
for (const r of result.received) console.log('Received', r.assetIds, 'in', r.txid);
for (const s of result.skipped) console.warn('Left in box:', s.messageId, s.reason);
```

## Internalizing a delivery yourself

If you receive a delivery by another channel, the receipt is a `basket insertion` into the asset's basket with BRC-207 receipt instructions:

```ts
import { assetBasket } from '@bsv/color-permission-module';
import { colorReceiptInstructions } from '@1sat/actions';

await wallet.internalizeAction({
  tx: atomicBeef,
  description: 'Receive 1Color tokens',
  outputs: [
    {
      outputIndex: 0,
      protocol: 'basket insertion',
      insertionRemittance: {
        basket: assetBasket(assetId, 'value'),
        customInstructions: colorReceiptInstructions({
          assetId,
          derivationPrefix,
          derivationSuffix,
          senderIdentityKey,
        }),
      },
    },
  ],
});
```

The transaction must already be admitted by the asset's overlay; the module checks ownership and admission and refuses anything else.

## Permission prompts

- `internalizeAction`
- Decrypting envelopes (`decrypt`) on first use

## Errors and skips

| Reason / code      | Cause                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| `overlay-required` | No overlay for the asset: message left unacknowledged                   |
| (skip reason)      | Bad signature or hash, unsupported entry or basket, output not admitted |
| `user-rejected`    | User denied the prompt                                                  |

## Related

- [1Color Tokens](../concepts/one-color.md)
- [send1Color](./send-1color.md)
- [1Color balances](./get-1color-balances.md)
- [syncMessages](./sync-messages.md)
