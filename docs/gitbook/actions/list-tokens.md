---
description: List BSV-21 token outputs from the wallet.
icon: list
---

# listTokens

**Package:** `@1sat/actions`
**Category:** BSV-21

## Signature

```ts
listTokens.execute(ctx: OneSatContext, input: ListTokensInput): Promise<WalletOutput[]>
```

## Input

```ts
interface ListTokensInput {
  /** Max number of token outputs to return */
  limit?: number;
}
```

## Output

```ts
type ListTokensResult = WalletOutput[];

interface WalletOutput {
  outpoint: string;        // "txid.vout"
  satoshis: number;
  spendable: boolean;
  tags?: string[];         // token tags include id, type:bsv-21, etc.
  labels?: string[];
  lockingScript?: string;
  customInstructions?: string;
}
```

The result is the same `WalletOutput[]` shape as `wallet.listOutputs`, filtered to BSV-21 token-bearing outputs.

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- None (read-only)

## Example

```tsx
import { listTokens } from '@1sat/actions';

const outputs = await listTokens.execute(ctx, { limit: 100 });
console.log(`${outputs.length} token UTXOs`);

for (const o of outputs) {
  console.log(o.outpoint, o.tags);
}
```

## Use cases

- Per-UTXO inspection of token holdings
- Coin-selection UI
- Debugging discrepancies between `getBsv21Balances` and on-chain state

## Common pitfalls

{% hint style="info" %}
Use [getBsv21Balances](./get-bsv21-balances.md) for aggregated per-token balances. Use `listTokens` when you need per-UTXO detail.
{% endhint %}

## Related

- [getBsv21Balances](./get-bsv21-balances.md)
- [sendBsv21](./send-bsv21.md)
- [Concept: Baskets & Tags](../concepts/baskets-and-tags.md)
- [Types: WalletOutput](../reference/types.md)
