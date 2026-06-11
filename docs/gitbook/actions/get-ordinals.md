---
description: Fetch the wallet's ordinal outputs plus the BEEF ancestry required to spend them.
icon: image
---

# getOrdinals

**Package:** `@1sat/actions`
**Category:** Ordinals

## Signature

```ts
getOrdinals.execute(ctx: OneSatContext, input: GetOrdinalsInput): Promise<GetOrdinalsResult>
```

## Input

```ts
interface GetOrdinalsInput {
  limit?: number; // default ~50
}
```

## Output

```ts
interface GetOrdinalsResult {
  outputs: WalletOutput[]; // ordinal outputs the wallet currently holds
  BEEF?: Uint8Array; // transaction ancestry; pass as inputBEEF to spending actions
}
```

`WalletOutput` carries `tags` like `origin`, `origin:<outpoint>`, `type:<mime>`, `name:<string>`.

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- None (read-only)

## Example

```tsx
import { getOrdinals } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, { limit: 50 });
console.log(`${outputs.length} ordinals`);
```

## Required entry point for spending actions

```tsx
import { getOrdinals, transferOrdinals } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
if (!BEEF) throw new Error('No BEEF returned');

const ordinal = outputs.find((o) => o.outpoint === targetOutpoint);
if (!ordinal) throw new Error('Ordinal not found');

await transferOrdinals.execute(ctx, {
  transfers: [{ ordinal, address: '1Recipient...' }],
  inputBEEF: Array.from(BEEF),
});
```

## Common pitfalls

{% hint style="warning" %}
`BEEF` may be `undefined` if the wallet has no ordinals or no cached ancestry. ALWAYS check `if (!BEEF)` before calling `Array.from(BEEF)` — you will throw on `undefined.length`.
{% endhint %}

{% hint style="info" %}
The result is a snapshot. If you act on an ordinal long after fetching, fetch again — the wallet may have moved the output.
{% endhint %}

## Errors

Typically thrown rather than returned in the result. Wrap in try/catch.

| Code            | Cause                        |
| --------------- | ---------------------------- |
| `not-connected` | Wallet disconnected mid-call |

## Related

- [transferOrdinals](./transfer-ordinals.md)
- [listOrdinal](./list-ordinal.md)
- [cancelListing](./cancel-listing.md)
- [opnsRegister](./opns-register.md)
- [burnOrdinals](./burn-ordinals.md)
- [Concept: BEEF](../concepts/beef.md)
- [Concept: Baskets & Tags](../concepts/baskets-and-tags.md)
