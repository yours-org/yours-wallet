---
description: Get OpNS name ordinals from the wallet, with BEEF for spending.
icon: list-ul
---

# getOpnsNames

**Package:** `@1sat/actions`
**Category:** OpNS

## Signature

```ts
getOpnsNames.execute(ctx: OneSatContext, input: GetOpnsNamesInput): Promise<GetOpnsNamesResult>
```

## Input

```ts
interface GetOpnsNamesInput {
  /** Max number of names to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}
```

## Output

```ts
interface GetOpnsNamesResult {
  outputs: WalletOutput[];   // OpNS name ordinals the wallet owns
  BEEF?: BEEF;               // ancestry — pass as inputBEEF to register/deregister
}
```

The result shape is the same as `getOrdinals` — a list of outputs plus optional BEEF for spending operations.

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- None (read-only)

## Example

```tsx
import { getOpnsNames, opnsRegister } from '@1sat/actions';

const { outputs, BEEF } = await getOpnsNames.execute(ctx, { limit: 50 });
console.log(`${outputs.length} OpNS names`);

// Use directly with opnsRegister / opnsDeregister:
const ordinal = outputs[0];
await opnsRegister.execute(ctx, {
  ordinal,
  inputBEEF: BEEF ? Array.from(BEEF) : undefined,
});
```

## Common pitfalls

{% hint style="warning" %}
`BEEF` may be `undefined`. Check before passing to register/deregister.
{% endhint %}

{% hint style="info" %}
This returns OpNS-typed ordinals only. For all ordinals (including non-OpNS), use [getOrdinals](./get-ordinals.md).
{% endhint %}

## Related

- [opnsRegister](./opns-register.md)
- [opnsDeregister](./opns-deregister.md)
- [getOrdinals](./get-ordinals.md)
- [Concept: BEEF](../concepts/beef.md)
