---
description: Register an OpNS name to the wallet's identity key.
icon: hashtag
---

# opnsRegister

**Package:** `@1sat/actions`
**Category:** OpNS

OpNS (Op = operation, NS = like DNS) is BSV's on-chain name service. Registering a name binds it to the wallet's identity key.

## Signature

```ts
opnsRegister.execute(ctx: OneSatContext, input: OpnsRegisterInput): Promise<OpnsRegisterResult>
```

## Input

```ts
interface OpnsRegisterInput {
  ordinal: WalletOutput;       // the OpNS name ordinal, from getOrdinals
  inputBEEF?: number[];        // Array.from(BEEF) — optional but recommended
}
```

## Output

```ts
interface OpnsRegisterResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- You own the OpNS name ordinal (acquired via mint / transfer / purchase)
- You have called `getOrdinals` first to fetch the ordinal + BEEF

## Permission prompts

- `createAction`

## Example

```tsx
import { getOrdinals, opnsRegister } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
const opnsOrdinal = outputs.find(o => o.outpoint === opnsOutpoint);
if (!opnsOrdinal) throw new Error('OpNS name not found');

const result = await opnsRegister.execute(ctx, {
  ordinal: opnsOrdinal,
  inputBEEF: BEEF ? Array.from(BEEF) : undefined,
});
if (result.error) throw new Error(result.error);
```

## Common pitfalls

{% hint style="warning" %}
You must own the OpNS name ordinal. Registration binds it to your wallet's identity key — others cannot register a name they do not hold.
{% endhint %}

{% hint style="info" %}
`inputBEEF` is technically optional but passing it is recommended for compatibility with strict overlay networks.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `not-found` | OpNS name ordinal not in wallet (stale — refetch) |
| `already-registered` | The name is already bound (use [opnsDeregister](./opns-deregister.md) first) |

## Related

- [opnsDeregister](./opns-deregister.md)
- [getOpnsNames](./get-opns-names.md)
- [getOrdinals](./get-ordinals.md)
- [Concept: BEEF](../concepts/beef.md)
