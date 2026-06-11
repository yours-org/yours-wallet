---
description: Get total MNEE balance across a set of derived addresses.
icon: scale-balanced
---

# getMneeBalance

**Package:** `@1sat/actions`
**Category:** MNEE

## Signature

```ts
getMneeBalance.execute(ctx: OneSatContext, input: GetMneeBalanceInput): Promise<GetMneeBalanceResult>
```

## Input

```ts
interface GetMneeBalanceInput {
  /** Addresses to query — from deriveDepositAddresses (default prefix '1sat') */
  addresses: string[];
}
```

## Output

```ts
interface GetMneeBalanceResult {
  /** Per-address breakdown */
  balances: Array<{
    address: string;
    /** Atomic units */
    amount: number;
    /** Decimal MNEE */
    decimalAmount: number;
  }>;
  /** Total balance in decimal MNEE */
  totalDecimal: number;
  /** Total balance in atomic units (number, not string) */
  totalAtomic: number;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Addresses already derived via [deriveDepositAddresses](./derive-deposit-addresses.md)

## Permission prompts

- None (read-only)

## Example

```tsx
import { deriveDepositAddresses, getMneeBalance } from '@1sat/actions';

const { derivations } = await deriveDepositAddresses.execute(ctx, {
  startIndex: 0,
  count: 5,
});
const addresses = derivations.map(d => d.address);

const balance = await getMneeBalance.execute(ctx, { addresses });
console.log(`Total: $${balance.totalDecimal}`);
```

## Common pitfalls

{% hint style="warning" %}
Pass `addresses` (the string array), not `derivations` (the full objects). For sending you need derivations; for balance only the address strings.
{% endhint %}

{% hint style="info" %}
Both `totalAtomic` and `totalDecimal` are JS `number`. For high-precision arithmetic prefer `totalAtomic` (integer math); for display use `totalDecimal`.
{% endhint %}

## Related

- [deriveDepositAddresses](./derive-deposit-addresses.md)
- [sendMnee](./send-mnee.md)
- [getMneeHistory](./get-mnee-history.md)
- [getMneeUtxos](./get-mnee-utxos.md)
- [Concept: Derivations](../concepts/derivations.md)
