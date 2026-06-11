---
description: Send MNEE in decimal amounts. Requires derivations array from deriveDepositAddresses.
icon: dollar-sign
---

# sendMnee

**Package:** `@1sat/actions`
**Category:** MNEE

## Signature

```ts
sendMnee.execute(ctx: OneSatContext, input: SendMneeInput): Promise<SendMneeResult>
```

## Input

```ts
interface SendMneeInput {
  recipients: Array<{
    address: string;
    /** Amount in decimal MNEE (e.g. 1.5 = $1.50) — number, not string */
    amount: number;
  }>;
  /** Source-address derivations (from deriveDepositAddresses). REQUIRED — sendMnee
   * uses these to sign with the matching per-address keys. */
  derivations: AddressDerivation[];
  /** Optional change address. If omitted, change returns to the first input's address. */
  changeAddress?: string;
}
```

## Output

```ts
interface SendMneeResult {
  txid?: string; // populated when on-chain
  ticketId?: string; // populated when settlement is batched off-chain — poll getMneeTxStatus
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Derivations from a prior `deriveDepositAddresses` call (with sufficient balance)

## Permission prompts

- `createAction`, `createSignature` (one per input)

## Example

```tsx
import { deriveDepositAddresses, sendMnee } from '@1sat/actions';

// 1. Get derivations (cache between renders)
const { derivations } = await deriveDepositAddresses.execute(ctx, {
  startIndex: 0,
  count: 5,
});

// 2. Send
const result = await sendMnee.execute(ctx, {
  recipients: [{ address: '1Recipient...', amount: Number(userInput) }],
  derivations, // REQUIRED — pass the full derivations array
});
if (result.error) throw new Error(result.error);

if (result.txid) {
  console.log('On-chain txid:', result.txid);
} else if (result.ticketId) {
  console.log('Pending ticket:', result.ticketId);
  // poll getMneeTxStatus until on-chain
}
```

## Common pitfalls

{% hint style="danger" %}
`amount` MUST be a **number** in **decimal MNEE**. `1.5` = $1.50. Coerce user input with `Number(userInput)`. Strings will silently misbehave.
{% endhint %}

{% hint style="warning" %}
`derivations` is REQUIRED. Pass the full array from `deriveDepositAddresses` — not just the addresses. Without it, the wallet cannot sign the inputs.
{% endhint %}

{% hint style="info" %}
MNEE settlements may be batched off-chain via the MNEE cosigner. A `ticketId` (without `txid`) means the transaction is queued. Poll with [getMneeTxStatus](./get-mnee-tx-status.md) until on-chain.
{% endhint %}

## Errors

| Code                | Cause                                                   |
| ------------------- | ------------------------------------------------------- |
| `user-rejected`     | User denied the wallet prompt                           |
| `insufficient-mnee` | Not enough MNEE balance across the provided derivations |
| `invalid-address`   | Malformed recipient address                             |
| `invalid-amount`    | `amount` was not a number or was non-positive           |

## Related

- [deriveDepositAddresses](./derive-deposit-addresses.md) — produces the `derivations` array
- [getMneeBalance](./get-mnee-balance.md)
- [getMneeTxStatus](./get-mnee-tx-status.md)
- [Concept: Derivations](../concepts/derivations.md)
- [Cookbook: MNEE Send Flow](../cookbook/mnee-send-flow.md)
