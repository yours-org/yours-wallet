---
description: One-shot pull from a MessageBox slot used by cosign-wrapped BSV-21 mints and transfers.
icon: inbox
---

# syncCosignDeliveries

**Package:** `@1sat/actions`
**Category:** Sync

One-shot pull from a `MessageBoxClient` slot used by cosign-wrapped BSV-21 token mints and transfers. Each (decrypted) message body carries a finalized BEEF, the cosign `customInstructions` the recipient needs at spend time, and the owned output index.

The decrypted output is internalized into the BSV-21 basket with the supplied `customInstructions` verbatim.

Decryption uses BRC-2 ECDH/AES-256-GCM via the wallet — matches what the sender used to encrypt.

## Signature

```ts
syncCosignDeliveries.execute(ctx: OneSatContext, input: SyncCosignDeliveriesInput): Promise<SyncCosignDeliveriesResult>
```

## Input

```ts
interface SyncCosignDeliveriesInput {
  /** Message box name. Default: 'cosign_token_inbox'. */
  messageBox?: string;
  /** MessageBox server URL. Default: 'https://messagebox.1sat.app'. */
  messageboxUrl?: string;
}
```

## Output

```ts
interface SyncCosignDeliveriesResult {
  /** Cosign token deliveries successfully internalized */
  processed: number;
  /** Messages that failed to internalize */
  failed: number;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- The wallet is registered to receive at the configured message box slot

## Permission prompts

- `decrypt` (per message decrypted)
- `internalizeAction` (per delivery internalized)

## Example

Default config (most apps):

```tsx
import { syncCosignDeliveries } from '@1sat/actions';

const result = await syncCosignDeliveries.execute(ctx, {});
console.log(`Internalized ${result.processed} cosign deliveries`);
```

Custom message box server:

```tsx
const result = await syncCosignDeliveries.execute(ctx, {
  messageBox: 'my_token_inbox',
  messageboxUrl: 'https://messagebox.example.com',
});
```

## Common pitfalls

{% hint style="info" %}
This is **one-shot** — it pulls everything currently in the slot, then returns. To poll continuously, call on a timer (e.g. on wallet popup mount, or every N minutes).
{% endhint %}

{% hint style="warning" %}
Decryption uses the wallet's identity key. Senders must encrypt to the wallet's identity pubkey — using BRC-2 ECDH + AES-256-GCM — for messages to be readable.
{% endhint %}

{% hint style="info" %}
Cosign BSV-21 outputs carry `customInstructions` that the wallet needs verbatim to spend the output later. The sync preserves them exactly.
{% endhint %}

## Use cases

- Wallet popup mount — drain pending cosign token deliveries
- After a sender confirms they have delivered a token via cosign

## Related

- [syncMessages](./sync-messages.md) — paymail message-box pull
- [syncAddresses](./sync-addresses.md) — indexer-driven sync
- [sendBsv21](./send-bsv21.md), [purchaseBsv21](./purchase-bsv21.md)
