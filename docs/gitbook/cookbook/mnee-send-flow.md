---
description: Complete MNEE send flow — derive (default prefix '1sat'), balance, send with derivations, poll status.
icon: dollar-sign
---

# MNEE Send Flow

**Goal:** Send MNEE from a Yours Wallet user to a recipient address.

## Prerequisites

- Connected wallet
- `ctx` from `createContext`
- Recipient address
- Amount as a user-input string (we will coerce to number)

## Steps

### 1. Derive addresses (default prefix '1sat')

```tsx
import { deriveDepositAddresses } from '@1sat/actions';

const { derivations } = await deriveDepositAddresses.execute(ctx, {
  startIndex: 0,
  count: 5,
});
const addresses = derivations.map((d) => d.address);
```

{% hint style="info" %}
Omit `prefix` to use the default `'1sat'`. This is the shared convention across all 1Sat wallets (Yours, wallet-desktop, CLI, MCP), so the same identity sees the same MNEE addresses everywhere.
{% endhint %}

### 2. (Optional) Check balance

```tsx
import { getMneeBalance } from '@1sat/actions';

const balance = await getMneeBalance.execute(ctx, { addresses });
console.log(`Available: $${balance.totalDecimal}`);

const sendAmount = Number(userInput);
if (sendAmount > balance.totalDecimal) {
  throw new Error('Insufficient MNEE balance');
}
```

### 3. Send (pass derivations + decimal amount)

```tsx
import { sendMnee } from '@1sat/actions';

const result = await sendMnee.execute(ctx, {
  recipients: [{ address: recipientAddress, amount: Number(userInput) }],
  derivations, // REQUIRED — the wallet needs these to sign inputs
});
if (result.error) throw new Error(result.error);
```

{% hint style="danger" %}
`amount` MUST be a number in decimal MNEE (`1.5` = $1.50). `Number(userInput)` coerces text. Strings will silently misbehave.
{% endhint %}

{% hint style="warning" %}
`derivations` is REQUIRED — pass the full array from step 1, not just the address strings.
{% endhint %}

### 4. Handle on-chain vs ticket settlement

```tsx
if (result.txid) {
  console.log('Settled on-chain:', result.txid);
} else if (result.ticketId) {
  console.log('Off-chain ticket — polling...');
  await pollUntilSettled(result.ticketId);
} else {
  throw new Error('Unexpected result shape');
}
```

### 5. Poll if needed

```tsx
import { getMneeTxStatus } from '@1sat/actions';

async function pollUntilSettled(ticketId: string) {
  for (let i = 0; i < 30; i++) {
    const status = await getMneeTxStatus.execute(ctx, { ticketId });
    if (status?.txid) {
      console.log('Confirmed on-chain:', status.txid);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Polling timeout');
}
```

## Common pitfalls

{% hint style="danger" %}
The `Number(userInput)` rule on `amount` is the #1 MNEE bug. Always coerce.
{% endhint %}

{% hint style="warning" %}
Forgetting `derivations` in the sendMnee call. It is required — the wallet has no other way to know which addresses you are spending from.
{% endhint %}

{% hint style="info" %}
For high-volume polling, switch to exponential backoff. Spamming the status endpoint is wasteful.
{% endhint %}

## See also

- [sendMnee](../actions/send-mnee.md)
- [deriveDepositAddresses](../actions/derive-deposit-addresses.md)
- [getMneeBalance](../actions/get-mnee-balance.md)
- [getMneeTxStatus](../actions/get-mnee-tx-status.md)
- [Concept: Derivations](../concepts/derivations.md)
