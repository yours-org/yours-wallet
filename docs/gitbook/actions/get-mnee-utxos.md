---
description: List MNEE UTXOs across a set of derived addresses.
icon: list
---

# getMneeUtxos

**Package:** `@1sat/actions`
**Category:** MNEE

## Signature

```ts
getMneeUtxos.execute(ctx: OneSatContext, input: GetMneeUtxosInput): Promise<GetMneeUtxosResult>
```

## Input

```ts
interface GetMneeUtxosInput {
  /** Addresses to query — from deriveDepositAddresses */
  addresses: string[];
}
```

## Output

```ts
interface GetMneeUtxosResult {
  utxos: MneeUtxo[];   // from @1sat/client
}
```

`MneeUtxo` is the indexer's UTXO descriptor (outpoint, address, atomic amount, spendable flag, plus MNEE-specific fields). See `@1sat/client` for the full shape.

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Addresses already derived

## Permission prompts

- None (read-only)

## Example

```tsx
import { deriveDepositAddresses, getMneeUtxos } from '@1sat/actions';

const { derivations } = await deriveDepositAddresses.execute(ctx, {
  startIndex: 0,
  count: 5,
});
const addresses = derivations.map(d => d.address);

const { utxos } = await getMneeUtxos.execute(ctx, { addresses });
console.log(`${utxos.length} MNEE UTXOs`);
```

## Use cases

- Coin-selection UI
- Auditing balance composition at the UTXO level
- Debugging discrepancies between `getMneeBalance` and on-chain state

## Related

- [getMneeBalance](./get-mnee-balance.md) — aggregated balances
- [sendMnee](./send-mnee.md)
- [deriveDepositAddresses](./derive-deposit-addresses.md)
