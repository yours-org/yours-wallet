---
description: Rotate plain BSV out of the wallet's P1SAT deposit basket into a fresh BRC-29 funding output.
icon: arrows-rotate
---

# sweepDeposit

**Package:** `@1sat/actions`
**Category:** Sweep / Sync

Used after a batch of inbound payments has been internalized. Plain BSV inbounds land in the deposit basket (filled by the internalize pipeline) and stay there until this helper picks them up and rotates them into the standard funding basket.

Calling this is **safe to retry** — a failed sweep leaves the deposits in place and the next call tries again.

## Signature

```ts
sweepDeposit.execute(ctx: OneSatContext, input: SweepDepositInput): Promise<SweepDepositResult>
```

## Input

```ts
interface SweepDepositInput {
  /** Cap on UTXOs to sweep in one tx. Default 50. */
  limit?: number;
}
```

## Output

```ts
interface SweepDepositResult {
  txid?: string;
  /** Number of deposit UTXOs swept into the new funding output */
  swept: number;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- At least one UTXO in the deposit basket (typically populated by `syncAddresses` or `syncMessages`)

## Permission prompts

- `createAction`

## Example

Run after a `syncAddresses` pass to consolidate any plain BSV inbounds:

```tsx
import { syncAddresses, sweepDeposit } from '@1sat/actions';

await syncAddresses.execute(ctx, { count: 5 });

const result = await sweepDeposit.execute(ctx, {});
if (result.error) {
  console.warn('Deposit sweep failed (will retry):', result.error);
} else {
  console.log(`Swept ${result.swept} deposit UTXOs into funding`);
}
```

## Common pitfalls

{% hint style="info" %}
A failed call is harmless — the deposits stay in the basket. Re-run later. There is no manual rollback to do.
{% endhint %}

{% hint style="info" %}
The `limit` cap exists because spending too many UTXOs in one transaction grows the transaction beyond practical fee limits. For wallets with many deposits, call repeatedly until `swept` is zero.
{% endhint %}

{% hint style="warning" %}
This rotates UTXOs from the P1SAT-derived deposit basket to the wallet's standard BRC-29 funding basket. After the sweep, the funds are available for normal spending via `sendBsv` / inscriptions / etc.
{% endhint %}

## Use cases

- Routine wallet housekeeping after `syncAddresses` / `syncMessages`
- After a paymail receive flow
- Before showing a balance that includes plain-BSV inbounds

## Related

- [syncAddresses](./sync-addresses.md) — populates the deposit basket from inbound P1SAT addresses
- [syncMessages](./sync-messages.md) — populates the deposit basket from paymail receipts
- [Concept: Baskets & Tags](../concepts/baskets-and-tags.md)
- [Concept: Derivations](../concepts/derivations.md)
