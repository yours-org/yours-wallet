---
description: Compute the wallet's BAP ID locally or resolve it from on-chain state.
icon: fingerprint
---

# computeBapId / resolveBapId

**Package:** `@1sat/actions`
**Category:** Identity

{% hint style="info" %}
These are plain async functions, NOT `.execute(ctx, input)` actions. They take `ctx` as the sole argument and return a string (or null).
{% endhint %}

Two related helpers:

* **`computeBapId(ctx)`** — derives the BAP ID deterministically from the wallet's identity key. Always returns a string. Does NOT require an on-chain record.
* **`resolveBapId(ctx)`** — looks up the BAP ID on-chain. Returns `null` if no identity has been published.

Use `computeBapId` when you need an identifier locally (UI keying, request signatures). Use `resolveBapId` when you need to confirm the identity is actually published.

## Signatures

```ts
computeBapId(ctx: OneSatContext): Promise<string>
resolveBapId(ctx: OneSatContext): Promise<string | null>
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- `computeBapId` may prompt for `getPublicKey` the first time
- `resolveBapId` is read-only

## Example

```tsx
import { computeBapId, resolveBapId } from '@1sat/actions';

// Always works, even before publishing
const bapId = await computeBapId(ctx);
console.log('Local BAP ID:', bapId);

// Returns null if not published
const onChain = await resolveBapId(ctx);
if (onChain === null) {
  console.log('Identity not yet on-chain — call publishIdentity or updateProfile');
} else {
  console.log('Published BAP ID:', onChain);
}
```

## Common pitfalls

{% hint style="warning" %}
`computeBapId` and `resolveBapId` should return the same string when the identity is published. If they differ, the wallet is in an inconsistent state (rare).
{% endhint %}

{% hint style="info" %}
These are pure functions, not action wrappers — no `result.error` envelope. They throw on failure.
{% endhint %}

## Related

- [publishIdentity](./publish-identity.md)
- [getProfile](./get-profile.md)
- [updateProfile](./update-profile.md)
- [rotateIdentity](./rotate-identity.md)
