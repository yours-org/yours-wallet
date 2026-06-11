---
description: Remove the identity binding from an OpNS name.
icon: trash
---

# opnsDeregister

**Package:** `@1sat/actions`
**Category:** OpNS

Removes the binding between an OpNS name and the wallet's identity key. The name ordinal is still owned by the wallet — it can be transferred, sold, or re-registered.

## Signature

```ts
opnsDeregister.execute(ctx: OneSatContext, input: OpnsDeregisterInput): Promise<OpnsDeregisterResult>
```

## Input

```ts
interface OpnsDeregisterInput {
  ordinal: WalletOutput;
  inputBEEF?: number[];
}
```

## Output

```ts
interface OpnsDeregisterResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- You own the OpNS name and it is currently registered to your identity
- You have called `getOrdinals` first

## Permission prompts

- `createAction`

## Example

```tsx
import { getOrdinals, opnsDeregister } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
const opnsOrdinal = outputs.find(o => o.outpoint === opnsOutpoint);
if (!opnsOrdinal) throw new Error('OpNS name not found');

const result = await opnsDeregister.execute(ctx, {
  ordinal: opnsOrdinal,
  inputBEEF: BEEF ? Array.from(BEEF) : undefined,
});
if (result.error) throw new Error(result.error);
```

## Common pitfalls

{% hint style="warning" %}
Deregistering does NOT destroy the name — the ordinal remains in your wallet. Use [transferOrdinals](./transfer-ordinals.md) or [listOrdinal](./list-ordinal.md) if you also want to give up ownership.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `not-found` | OpNS name not in wallet (stale — refetch) |
| `not-registered` | Name is not currently registered |

## Related

- [opnsRegister](./opns-register.md)
- [getOpnsNames](./get-opns-names.md)
- [transferOrdinals](./transfer-ordinals.md)
