---
description: Drain all BSV in the default basket to a single destination address.
icon: hand-holding-dollar
---

# sendAllBsv

**Package:** `@1sat/actions`
**Category:** Payments

## Signature

```ts
sendAllBsv.execute(ctx: OneSatContext, input: SendAllBsvInput): Promise<SendAllBsvResult>
```

## Input

```ts
interface SendAllBsvInput {
  destination: string; // P2PKH address to receive the swept balance
}
```

## Output

```ts
interface SendAllBsvResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- At least one spendable BSV output in the `default` basket

## Permission prompts

- `createAction`

## Example

```tsx
import { sendAllBsv } from '@1sat/actions';

const result = await sendAllBsv.execute(ctx, {
  destination: '1Address...',
});
if (result.error) throw new Error(result.error);
console.log('Swept to txid:', result.txid);
```

## Common pitfalls

{% hint style="warning" %}
This drains every spendable BSV output in the `default` basket. Ordinals, BSV-21, and locked outputs live in other baskets and are NOT affected — but if anything unusual ended up tagged into `default`, it will be swept.
{% endhint %}

{% hint style="danger" %}
Irreversible. After success the wallet has zero `default`-basket BSV balance. Make sure the user explicitly confirmed.
{% endhint %}

## Errors

| Code                   | Cause                         |
| ---------------------- | ----------------------------- |
| `user-rejected`        | User denied the wallet prompt |
| `no-spendable-outputs` | `default` basket is empty     |
| `invalid-address`      | Malformed destination address |

## Related

- [sendBsv](./send-bsv.md)
- [listOutputs](./list-outputs.md)
- [Concept: Baskets & Tags](../concepts/baskets-and-tags.md)
