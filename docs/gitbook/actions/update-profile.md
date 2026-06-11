---
description: Update the wallet's BAP profile. Auto-publishes if no identity has been published yet.
icon: pen
---

# updateProfile

**Package:** `@1sat/actions`
**Category:** Identity

## Signature

```ts
updateProfile.execute(ctx: OneSatContext, input: UpdateProfileInput): Promise<UpdateProfileResult>
```

## Input

```ts
interface UpdateProfileInput {
  profile: {
    '@type'?: string; // typically 'Person' or 'Organization' (Schema.org)
    name?: string;
    image?: string; // 1sat://txid.vout or a URL
    description?: string;
    [key: string]: any;
  };
}
```

## Output

```ts
interface UpdateProfileResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Small BSV reserve for inscription fee

## Permission prompts

- `createAction`

## Example

```tsx
import { updateProfile } from '@1sat/actions';

const result = await updateProfile.execute(ctx, {
  profile: {
    '@type': 'Person',
    name: 'Alice',
    image: '1sat://abc123...def.0',
    description: 'BSV builder.',
  },
});
if (result.error) throw new Error(result.error);
```

## Common pitfalls

{% hint style="info" %}
`updateProfile` **auto-publishes** the identity if it has not been published yet. You do not need to call [publishIdentity](./publish-identity.md) first.
{% endhint %}

{% hint style="warning" %}
`updateProfile` writes the **full** `profile` object you pass into the on-chain ALIAS record — it is **replace**, not merge. If you only want to change one field, fetch the current profile with [getProfile](./get-profile.md) first, modify, and pass the full merged object back.
{% endhint %}

## Errors

| Code                 | Cause                         |
| -------------------- | ----------------------------- |
| `user-rejected`      | User denied the wallet prompt |
| `insufficient-funds` | Not enough BSV                |
| `invalid-profile`    | Profile shape invalid         |

## Related

- [getProfile](./get-profile.md) — read current state before updating
- [publishIdentity](./publish-identity.md)
- [inscribe](./inscribe.md) — for inscribing an avatar before referencing it via `1sat://`
- [Cookbook: BAP Identity Setup](../cookbook/bap-identity-setup.md)
