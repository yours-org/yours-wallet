---
description: Poll the message box for incoming paymail payments and internalize them.
icon: envelope-open
---

# syncMessages

**Package:** `@1sat/actions`
**Category:** Sync

Polls the wallet's message box for incoming paymail payments, internalizes each one via the BEEF pipeline, and acknowledges only after successful internalization. Failed internalizations stay in the message box for retry.

## Signature

```ts
syncMessages.execute(ctx: OneSatContext, input: SyncMessagesInput): Promise<SyncMessagesResult>
```

## Input

```ts
interface SyncMessagesInput {
  /** Message box name to poll. Default: 'payment_inbox'. */
  messageBox?: string;
}
```

## Output

```ts
interface SyncMessagesResult {
  /** Messages successfully internalized */
  processed: number;
  /** Messages that failed to internalize */
  failed: number;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- The wallet has a paymail / message box configured

## Permission prompts

- `internalizeAction` (per message internalized)

## Example

```tsx
import { syncMessages } from '@1sat/actions';

const result = await syncMessages.execute(ctx, {});
console.log(`Processed ${result.processed}, ${result.failed} failed`);
```

Custom message box:

```tsx
await syncMessages.execute(ctx, { messageBox: 'priority_inbox' });
```

## Common pitfalls

{% hint style="info" %}
Failed messages remain in the message box — re-call `syncMessages` later to retry. There is no manual ack of failures.
{% endhint %}

{% hint style="info" %}
After a successful sync, the new UTXOs may land in the wallet's deposit basket. Run [sweepDeposit](./sweep-deposit.md) to consolidate them into the funding basket.
{% endhint %}

## Use cases

- On wallet load, drain pending paymail payments
- Periodic background poll while the wallet is open
- After a notification that an incoming payment was sent

## Related

- [sweepDeposit](./sweep-deposit.md) — typical follow-up after sync
- [syncAddresses](./sync-addresses.md) — for indexer-driven sync (instead of message-box-driven)
- [syncCosignDeliveries](./sync-cosign-deliveries.md) — for cosign BSV-21 token deliveries
