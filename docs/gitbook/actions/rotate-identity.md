---
description: Rotate the wallet's BAP identity key for forward security.
icon: rotate
---

# rotateIdentity

**Package:** `@1sat/actions`
**Category:** Identity

{% hint style="danger" %}
Rotating an identity key is **irreversible**. After rotation, the old key can no longer sign new identity records. Make sure the user explicitly confirmed.
{% endhint %}

## Signature

```ts
rotateIdentity.execute(ctx: OneSatContext, input: {}): Promise<RotateIdentityResult>
```

## Input

```ts
interface RotateIdentityInput {}
```

## Output

```ts
interface RotateIdentityResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet with a published identity
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Small BSV reserve for the rotation inscription

## Permission prompts

- `createAction`

## Example

```tsx
import { rotateIdentity } from '@1sat/actions';

const result = await rotateIdentity.execute(ctx, {});
if (result.error) throw new Error(result.error);
console.log('Identity rotated in:', result.txid);
```

## Use cases

- Forward secrecy after a suspected key leak
- Routine periodic rotation for high-value identities
- Migrating an identity to a new key while preserving the BAP ID linkage on-chain

## Common pitfalls

{% hint style="warning" %}
Verifiers who cached the old identity key may need to re-resolve to find the new one. If your dApp caches identity public keys client-side, key your cache by BAP ID + version, not by key alone.
{% endhint %}

## Related

- [publishIdentity](./publish-identity.md)
- [getProfile](./get-profile.md)
- [computeBapId / resolveBapId](./compute-resolve-bap-id.md)
