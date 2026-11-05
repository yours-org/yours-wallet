---
description: Deploy a new 1Color (BRC-162) token — fixed supply or an authority deploy — through the wallet's color module.
icon: rocket
---

# deploy1Color

**Package:** `@1sat/actions`
**Category:** 1Color

## Signature

```ts
deploy1Color.execute(ctx: OneSatContext, input: Deploy1ColorInput): Promise<Deploy1ColorResponse>
```

## Input

```ts
interface Deploy1ColorInput {
  /** Supply in atomic units: > 0 is a fixed-supply deploy, 0 an authority deploy */
  amount: string | bigint;
  /** Decimal places (`dec`), 0-18 */
  decimals?: number;
  /** Ticker (`sym`); not unique */
  symbol?: string;
  /** Icon embedded in the deploy: its media type and bytes */
  icon?: { mediaType: string; bytes: number[] | Uint8Array };
}
```

## Output

```ts
interface Deploy1ColorResponse {
  txid?: string;
  /** AtomicBEEF of the deploy transaction */
  tx?: number[];
  /** The asset id, `<txid>_0` */
  assetId?: string;
  error?: string;
}
```

## What it does

One `createAction`. Output 0 is the deploy, locked to a key the wallet derives under the `ISSUE` selector. The labels carry a plan that names output 0 as owned with one `deploy-fixed` (amount > 0) or `deploy-authority` (amount 0) operation. The wallet's color module checks the plan, files the signed deploy into the new asset's value or authority basket, and submits it to the discovery topic `tm_color` and the asset's own topic.

A fixed-supply deploy puts the whole supply in the wallet as one value output. An authority deploy creates an authority output that can later mint.

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain, services })`
- Small BSV reserve in the `default` basket for the fee
- An overlay for the chain (testnet has a default; mainnet needs one set in Settings → Token overlays). See [1Color Tokens](../concepts/one-color.md#overlays)

## Permission prompts

- `createAction` — the 1Color consent prompt, showing the deploy and the fee
- `getPublicKey` on first use of the `p color` protocol

## Example

```tsx
import { deploy1Color } from '@1sat/actions';

const result = await deploy1Color.execute(ctx, {
  amount: '1000000000', // 10,000,000.00 with decimals: 2
  decimals: 2,
  symbol: 'NANNER',
  icon: { mediaType: 'image/png', bytes: pngBytes },
});
if (result.error) throw new Error(result.error);
console.log('Asset id:', result.assetId);
```

## Common pitfalls

{% hint style="danger" %}
`amount` is in **atomic units**. With `decimals: 2`, a supply of 10,000,000 tokens is `'1000000000'`.
{% endhint %}

{% hint style="warning" %}
The icon's bytes are embedded in the transaction and paid for by the deployer. Yours shows the embedded icon at any size, but keep it small: every holder's wallet downloads the deploy to read the symbol, decimals and icon.
{% endhint %}

{% hint style="info" %}
`symbol` is not unique. Identify a token by `assetId`, never by its ticker.
{% endhint %}

## Errors

| Code             | Cause                                                   |
| ---------------- | ------------------------------------------------------- |
| `user-rejected`  | User denied the prompt                                  |
| `no-transaction` | The wallet returned no signed transaction               |
| (thrown message) | Overlay refused the deploy, or no overlay is configured |

## Related

- [1Color Tokens](../concepts/one-color.md)
- [send1Color](./send-1color.md)
- [1Color balances](./get-1color-balances.md)
