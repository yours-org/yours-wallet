---
description: Sweep BSV from an external WIF private key into the wallet.
icon: arrow-down-to-bracket
---

# sweepBsv

**Package:** `@1sat/actions`
**Category:** Sweep

## Signature

```ts
sweepBsv.execute(ctx: OneSatContext, input: SweepBsvInput): Promise<SweepBsvResult>
```

## Input

```ts
import type { PrivateKey } from '@bsv/sdk';

interface SweepBsvInput {
  inputs: SweepInput[];      // prepared via prepareSweepInputs
  keys: PrivateKey[];        // signing keys (one per address)
}
```

## Output

```ts
interface SweepBsvResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- You have scanned the source address(es) for UTXOs (out of scope for this SDK — use a service like `@1sat/client` or external indexer)
- You have prepared `inputs` via `prepareSweepInputs(ctx, scannedUtxos)`

## Permission prompts

- `createAction`

## Example

```tsx
import { sweepBsv, prepareSweepInputs } from '@1sat/actions';
import { PrivateKey } from '@bsv/sdk';

const key = PrivateKey.fromWif('L1abc...');

// 1. Scan UTXOs for the address (NOT done by this SDK).
const scannedUtxos = await scanUtxos(key.toAddress()); // your code

// 2. Prepare inputs.
const inputs = await prepareSweepInputs(ctx, scannedUtxos);

// 3. Sweep.
const result = await sweepBsv.execute(ctx, {
  inputs,
  keys: [key],
});
if (result.error) throw new Error(result.error);
console.log('Swept into wallet:', result.txid);
```

## Common pitfalls

{% hint style="warning" %}
Scanning the source address for UTXOs is the caller's responsibility. `prepareSweepInputs` does not scan — it shapes already-scanned UTXOs into the format `sweepBsv` expects.
{% endhint %}

{% hint style="danger" %}
The WIF key gives access to the funds. Handle it in memory, do not log it, and clear references after sweep.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `no-inputs` | `inputs` array empty (nothing to sweep) |
| `signing-failed` | Provided key does not unlock the input |

## Related

- [sweepOrdinals](./sweep-ordinals.md)
- [sweepBsv21](./sweep-bsv21.md)
- [Cookbook: Sweep Paper Wallet](../cookbook/sweep-paper-wallet.md)
