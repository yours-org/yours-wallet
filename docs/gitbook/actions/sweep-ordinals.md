---
description: Sweep ordinals from an external WIF private key into the wallet.
icon: arrow-down-to-bracket
---

# sweepOrdinals

**Package:** `@1sat/actions`
**Category:** Sweep

## Signature

```ts
sweepOrdinals.execute(ctx: OneSatContext, input: SweepOrdinalsInput): Promise<SweepOrdinalsResult>
```

## Input

```ts
import type { PrivateKey } from '@bsv/sdk';

interface SweepOrdinalsInput {
  inputs: SweepInput[];   // from prepareSweepInputs — filtered to ordinal UTXOs
  keys: PrivateKey[];
}
```

## Output

```ts
interface SweepOrdinalsResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Scanned UTXOs include the ordinal-bearing outputs of the source address
- `prepareSweepInputs` has been called

## Permission prompts

- `createAction`

## Example

```tsx
import { sweepOrdinals, prepareSweepInputs } from '@1sat/actions';
import { PrivateKey } from '@bsv/sdk';

const key = PrivateKey.fromWif('L1abc...');
const scannedOrdUtxos = await scanOrdinalUtxos(key.toAddress()); // your code
const inputs = await prepareSweepInputs(ctx, scannedOrdUtxos);

const result = await sweepOrdinals.execute(ctx, {
  inputs,
  keys: [key],
});
if (result.error) throw new Error(result.error);
```

## Common pitfalls

{% hint style="warning" %}
Only pass ordinal-bearing UTXOs in `inputs`. Mixing in plain BSV outputs will produce a malformed transaction. Use [sweepBsv](./sweep-bsv.md) for plain BSV separately.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `no-inputs` | No ordinal inputs to sweep |
| `signing-failed` | Key does not unlock the input |

## Related

- [sweepBsv](./sweep-bsv.md)
- [sweepBsv21](./sweep-bsv21.md)
- [Cookbook: Sweep Paper Wallet](../cookbook/sweep-paper-wallet.md)
