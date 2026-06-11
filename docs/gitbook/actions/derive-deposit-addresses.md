---
description: Derive P1SAT deposit addresses. Default prefix '1sat' is shared across 1Sat wallets.
icon: arrows-split-up-and-left
---

# deriveDepositAddresses

**Package:** `@1sat/actions`
**Category:** Addresses / MNEE

## Signature

```ts
deriveDepositAddresses.execute(ctx: OneSatContext, input: DeriveDepositAddressesInput): Promise<DeriveDepositAddressesResult>
```

## Input

```ts
interface DeriveDepositAddressesInput {
  /** keyID prefix. Defaults to '1sat' (DEFAULT_DEPOSIT_PREFIX). */
  prefix?: string;
  /** First derivation index. Default 0. */
  startIndex?: number;
  /** How many addresses to derive. Default 1. */
  count?: number;
}
```

## Output

```ts
interface DeriveDepositAddressesResult {
  derivations: AddressDerivation[];
}

interface AddressDerivation {
  address: string;
  // plus keyID info needed for signing — used by sendMnee
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- `getPublicKey` (potentially, depending on cache state)

## Example

Default prefix (recommended for MNEE):

```tsx
import { deriveDepositAddresses } from '@1sat/actions';

const { derivations } = await deriveDepositAddresses.execute(ctx, {
  startIndex: 0,
  count: 5,
});
const addresses = derivations.map((d) => d.address);
```

Custom prefix (only when you want a distinct address set):

```tsx
const { derivations } = await deriveDepositAddresses.execute(ctx, {
  prefix: 'my-app',
  startIndex: 0,
  count: 5,
});
```

## Common pitfalls

{% hint style="info" %}
The default prefix `'1sat'` is intentionally shared across 1Sat wallets (Yours Wallet, wallet-desktop, CLI, MCP servers). Omit `prefix` to use the default — that way every implementation derives the same MNEE addresses for the same identity key.
{% endhint %}

{% hint style="warning" %}
If you pass a custom `prefix`, the user's MNEE under the default prefix is NOT visible — you are looking at a different address tree.
{% endhint %}

{% hint style="info" %}
Cache the `derivations` result. Re-deriving on every render is wasteful and may trigger redundant permission prompts.
{% endhint %}

## Related

- [getMneeBalance](./get-mnee-balance.md) — consumes `addresses`
- [sendMnee](./send-mnee.md) — consumes `derivations` (the full objects)
- [syncAddresses](./sync-addresses.md)
- [Concept: Derivations](../concepts/derivations.md)
