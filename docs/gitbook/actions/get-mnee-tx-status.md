---
description: Poll the status of an off-chain MNEE settlement by ticketId.
icon: spinner
---

# getMneeTxStatus

**Package:** `@1sat/actions`
**Category:** MNEE

## Signature

```ts
getMneeTxStatus.execute(ctx: OneSatContext, input: GetMneeTxStatusInput): Promise<MneeTransferStatus>
```

## Input

```ts
interface GetMneeTxStatusInput {
  /** Ticket ID returned by sendMnee when settlement is batched */
  ticketId: string;
}
```

## Output

```ts
type MneeTransferStatus = /* from @1sat/client */
  // status fields including txid when settled, plus any pending / failed state.
  // See @1sat/client for the full shape.
  any;
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- A `ticketId` from a prior `sendMnee` call

## Permission prompts

- None (read-only)

## Example

```tsx
import { sendMnee, getMneeTxStatus } from '@1sat/actions';

const result = await sendMnee.execute(ctx, {
  recipients: [{ address: '1...', amount: Number(input) }],
  derivations,
});

if (result.ticketId) {
  for (let i = 0; i < 30; i++) {
    const status = await getMneeTxStatus.execute(ctx, { ticketId: result.ticketId });
    if (status.txid) {
      console.log('Settled in:', status.txid);
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}
```

## Common pitfalls

{% hint style="info" %}
Not all `sendMnee` calls return a `ticketId` — many settle on-chain immediately with `txid`. Only poll when `ticketId` is present.
{% endhint %}

{% hint style="warning" %}
Use exponential backoff or capped polling. Spamming the status endpoint wastes wallet bandwidth.
{% endhint %}

## Related

- [sendMnee](./send-mnee.md)
- [getMneeHistory](./get-mnee-history.md)
- [Cookbook: MNEE Send Flow](../cookbook/mnee-send-flow.md)
