---
description: Get the wallet's BSV-21 token balances across all held tokens.
icon: coins
---

# getBsv21Balances

**Package:** `@1sat/actions`
**Category:** BSV-21

## Signature

```ts
getBsv21Balances.execute(ctx: OneSatContext, input: {}): Promise<Bsv21Balance[]>
```

## Input

```ts
type GetBsv21BalancesInput = Record<string, never>;
```

## Output

```ts
interface Bsv21Balance {
  /** Token protocol — typically 'bsv-20' (BSV-21 reuses the BSV-20 protocol field) */
  p: string;
  /** Token id — outpoint for BSV-21 (txid_vout format), tick for BSV-20 */
  id: string;
  /** Token symbol */
  sym?: string;
  /** Optional icon URL */
  icon?: string;
  /** Decimal places */
  dec: number;
  /** Total amount (confirmed + pending), atomic units as string */
  amt: string;
  /** Confirmed / pending breakdown, as bigints */
  all: { confirmed: bigint; pending: bigint };
  /** Same shape, but for outputs locked in listings */
  listed: { confirmed: bigint; pending: bigint };
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- None (read-only)

## Example

```tsx
import { getBsv21Balances } from '@1sat/actions';

const balances = await getBsv21Balances.execute(ctx, {});

for (const b of balances) {
  const total = b.all.confirmed + b.all.pending; // bigint math
  const display = Number(total) / 10 ** b.dec; // convert for UI
  console.log(`${b.sym ?? b.id}: ${display}`);
}
```

## Common pitfalls

{% hint style="warning" %}
`all.confirmed`, `all.pending`, `listed.confirmed`, `listed.pending` are **`bigint`** values, not strings or numbers. Use `+` / `-` for arithmetic, then `Number(...)` only when displaying.
{% endhint %}

{% hint style="info" %}
Token IDs use **underscore** format `txid_vout` (not the dot-format outpoint). The `id` field reflects this.
{% endhint %}

{% hint style="info" %}
`sym` and `icon` are optional. A newly-deployed token without metadata may have `sym: undefined`.
{% endhint %}

## Related

- [sendBsv21](./send-bsv21.md)
- [listTokens](./list-tokens.md)
- [purchaseBsv21](./purchase-bsv21.md)
