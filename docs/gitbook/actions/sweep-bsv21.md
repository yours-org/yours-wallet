---
description: Sweep BSV-21 tokens from an external WIF private key into the wallet.
icon: arrow-down-to-bracket
---

# sweepBsv21

**Package:** `@1sat/actions`
**Category:** Sweep

## Signature

```ts
sweepBsv21.execute(ctx: OneSatContext, input: SweepBsv21Input): Promise<SweepBsv21Result>
```

## Input

```ts
import type { PrivateKey } from '@bsv/sdk';

interface SweepBsv21Input {
  inputs: SweepInput[]; // from prepareSweepInputs — filtered to BSV-21 UTXOs
  keys: PrivateKey[];
}
```

## Output

```ts
interface SweepBsv21Result {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Scanned UTXOs include the BSV-21 token outputs of the source address
- `prepareSweepInputs` has been called

## Permission prompts

- `createAction`

## Example

```tsx
import { sweepBsv21, prepareSweepInputs } from '@1sat/actions';
import { PrivateKey } from '@bsv/sdk';

const key = PrivateKey.fromWif('L1abc...');
const scannedBsv21Utxos = await scanBsv21Utxos(key.toAddress()); // your code
const inputs = await prepareSweepInputs(ctx, scannedBsv21Utxos);

const result = await sweepBsv21.execute(ctx, {
  inputs,
  keys: [key],
});
if (result.error) throw new Error(result.error);
```

## Common pitfalls

{% hint style="warning" %}
Only pass BSV-21 UTXOs in `inputs`. Mixing in plain BSV or ordinals will produce a malformed transaction.
{% endhint %}

{% hint style="info" %}
A typical paper-wallet import calls all three sweep functions in sequence: first BSV, then ordinals, then BSV-21. See [Sweep Paper Wallet](../cookbook/sweep-paper-wallet.md).
{% endhint %}

## Errors

| Code             | Cause                         |
| ---------------- | ----------------------------- |
| `user-rejected`  | User denied the wallet prompt |
| `no-inputs`      | No BSV-21 inputs to sweep     |
| `signing-failed` | Key does not unlock the input |

## Related

- [sweepBsv](./sweep-bsv.md)
- [sweepOrdinals](./sweep-ordinals.md)
- [sendBsv21](./send-bsv21.md)
- [Cookbook: Sweep Paper Wallet](../cookbook/sweep-paper-wallet.md)
