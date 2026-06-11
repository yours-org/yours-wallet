---
description: Permanently destroy one or more ordinals. Available as both an action and a builder helper.
icon: fire
---

# burnOrdinals

**Package:** `@1sat/actions`
**Category:** Ordinals

{% hint style="danger" %}
Burning is **irreversible**. The ordinal cannot be recovered. Use only when the user has explicitly confirmed.
{% endhint %}

Two forms are exported:

* **`burnOrdinals`** — high-level action. Call `.execute(ctx, input)` directly. Builds, signs, and broadcasts in one step.
* **`buildBurnOrdinals`** — builder. Returns `CreateActionArgs` for `wallet.createAction`. Use when you need to inspect or modify the transaction before broadcasting.

## burnOrdinals (action)

### Signature

```ts
burnOrdinals.execute(ctx: OneSatContext, input: BurnOrdinalsRequest): Promise<OrdinalOperationResponse>
```

### Input

```ts
interface BurnOrdinalsRequest {
  /** Ordinal outputs to burn — from getOrdinals */
  ordinals: WalletOutput[];
  /** BEEF — resolved automatically via id tag if omitted */
  inputBEEF?: number[];
  /** Application name for MAP metadata (default: '1sat') */
  app?: string;
}
```

### Output

```ts
interface OrdinalOperationResponse {
  txid?: string;
  tx?: number[];
  error?: string;
}
```

### Example

```tsx
import { getOrdinals, burnOrdinals } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
const toBurn = outputs.filter(o => burnSet.includes(o.outpoint));

const result = await burnOrdinals.execute(ctx, {
  ordinals: toBurn,
  inputBEEF: BEEF ? Array.from(BEEF) : undefined,
  app: 'my-app',
});
if (result.error) throw new Error(result.error);
console.log('Burned in:', result.txid);
```

---

## buildBurnOrdinals (builder)

For advanced flows that need to inspect or modify the CreateActionArgs before broadcasting:

```ts
buildBurnOrdinals(ctx: OneSatContext, request: BurnOrdinalsRequest): Promise<CreateActionArgs | { error: string }>
```

### Example

```tsx
import { buildBurnOrdinals } from '@1sat/actions';
import { useWallet } from '@1sat/react';

const { wallet } = useWallet();

const built = await buildBurnOrdinals(ctx, {
  ordinals: toBurn,
  inputBEEF: BEEF ? Array.from(BEEF) : undefined,
});
if ('error' in built) throw new Error(built.error);

// Inspect / modify built (CreateActionArgs)...
const result = await wallet.createAction(built);
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- You have called `getOrdinals` first

## Permission prompts

- `createAction`

## Common pitfalls

{% hint style="danger" %}
Once the transaction is broadcast (either via `burnOrdinals.execute` or `wallet.createAction(buildBurnOrdinals(...))`), the ordinal is gone forever.
{% endhint %}

{% hint style="info" %}
`buildBurnOrdinals` does NOT broadcast. The ordinal is only burned when the resulting `CreateActionArgs` is passed to `wallet.createAction`.
{% endhint %}

## Related

- [getOrdinals](./get-ordinals.md) — required first call
- [transferOrdinals](./transfer-ordinals.md) — non-destructive alternative
- [Transaction Actions (low-level)](../low-level/transaction-actions.md)
- [Concept: BEEF](../concepts/beef.md)
