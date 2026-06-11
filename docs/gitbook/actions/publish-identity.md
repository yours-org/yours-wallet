---
description: Publish the initial BAP identity record on-chain.
icon: bullhorn
---

# publishIdentity

**Package:** `@1sat/actions`
**Category:** Identity

## Signature

```ts
publishIdentity.execute(ctx: OneSatContext, input: {}): Promise<PublishIdentityResult>
```

## Input

```ts
interface PublishIdentityInput {}
```

## Output

```ts
interface PublishIdentityResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Small BSV reserve to cover the inscription fee

## Permission prompts

- `createAction`

## Example

```tsx
import { publishIdentity } from '@1sat/actions';

const result = await publishIdentity.execute(ctx, {});
if (result.error) throw new Error(result.error);
console.log('Identity published in:', result.txid);
```

## Common pitfalls

{% hint style="info" %}
`publishIdentity` is **idempotent**. If the wallet already has a published identity, the call returns the existing record's txid (or no-ops). You do not need to guard against double-publish.
{% endhint %}

{% hint style="info" %}
[updateProfile](./update-profile.md) auto-publishes if needed, so you rarely need to call `publishIdentity` directly. It exists for cases where you want to publish a bare identity without setting profile fields.
{% endhint %}

## Errors

| Code                 | Cause                              |
| -------------------- | ---------------------------------- |
| `user-rejected`      | User denied the wallet prompt      |
| `insufficient-funds` | Not enough BSV for the inscription |

## Related

- [updateProfile](./update-profile.md)
- [getProfile](./get-profile.md)
- [rotateIdentity](./rotate-identity.md)
- [Cookbook: BAP Identity Setup](../cookbook/bap-identity-setup.md)
