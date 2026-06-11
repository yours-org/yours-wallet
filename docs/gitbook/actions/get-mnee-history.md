---
description: Get paginated MNEE transaction history for a set of derived addresses.
icon: clock-rotate-left
---

# getMneeHistory

**Package:** `@1sat/actions`
**Category:** MNEE

## Signature

```ts
getMneeHistory.execute(ctx: OneSatContext, input: GetMneeHistoryInput): Promise<GetMneeHistoryResult>
```

## Input

```ts
interface GetMneeHistoryInput {
  /** Addresses to query — from deriveDepositAddresses */
  addresses: string[];
  /** Pagination cursor — pass nextScore from prior result for next page */
  fromScore?: number;
  /** Max results. Default 50. */
  limit?: number;
}
```

## Output

```ts
interface GetMneeHistoryResult {
  history: Array<{
    txid: string;
    height: number;
    type: 'send' | 'receive';
    status: 'confirmed' | 'unconfirmed';
    /** Amount in atomic units sent/received (excluding fees and self-change) */
    amount: number;
    /** Fee in atomic units (sends only) */
    fee: number;
    /** Pagination cursor for THIS entry */
    score: number;
    /** Counterparty addresses + amounts */
    counterparties: Array<{
      address: string;
      amount: number;
    }>;
  }>;
  /** Pass as fromScore on the next call to paginate */
  nextScore?: number;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Addresses already derived

## Permission prompts

- None (read-only)

## Example

First page:

```tsx
import { deriveDepositAddresses, getMneeHistory } from '@1sat/actions';

const { derivations } = await deriveDepositAddresses.execute(ctx, {
  startIndex: 0,
  count: 5,
});
const addresses = derivations.map(d => d.address);

const { history, nextScore } = await getMneeHistory.execute(ctx, {
  addresses,
  limit: 20,
});

for (const entry of history) {
  const sign = entry.type === 'send' ? '-' : '+';
  console.log(`${sign}${entry.amount} atomic @ ${entry.height} (${entry.status})`);
}
```

Next page:

```tsx
const page2 = await getMneeHistory.execute(ctx, {
  addresses,
  fromScore: nextScore,
  limit: 20,
});
```

## Common pitfalls

{% hint style="info" %}
`amount` and `fee` are in **atomic units** (integer-shaped numbers). Divide by the MNEE decimals to display.
{% endhint %}

{% hint style="info" %}
History only covers addresses you pass in. If the user received at a not-yet-derived address, that entry will not appear until you derive further and call [syncAddresses](./sync-addresses.md).
{% endhint %}

## Related

- [deriveDepositAddresses](./derive-deposit-addresses.md)
- [getMneeBalance](./get-mnee-balance.md)
- [getMneeTxStatus](./get-mnee-tx-status.md)
- [syncAddresses](./sync-addresses.md)
