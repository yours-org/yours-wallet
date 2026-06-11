---
description: Read the wallet's BAP identity profile.
icon: id-card
---

# getProfile

**Package:** `@1sat/actions`
**Category:** Identity

## Signature

```ts
getProfile.execute(ctx: OneSatContext, input: {}): Promise<GetProfileResult>
```

## Input

```ts
interface GetProfileInput {}
```

## Output

```ts
interface GetProfileResult {
  bapId?: string;
  profile?: {
    '@type'?: string; // typically 'Person' or 'Organization' (Schema.org)
    name?: string;
    image?: string; // may be a 1sat://txid.vout URI
    description?: string;
    [key: string]: any;
  };
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- None (read-only)

## Example

```tsx
import { getProfile } from '@1sat/actions';

const result = await getProfile.execute(ctx, {});
if (result.error) throw new Error(result.error);

if (result.bapId) {
  console.log(`BAP ID: ${result.bapId}`);
  console.log(`Name: ${result.profile?.name}`);
} else {
  console.log('No published identity yet');
}
```

## Common pitfalls

{% hint style="info" %}
A null `bapId` means the wallet has not yet published an identity record on-chain. Call [publishIdentity](./publish-identity.md) (or [updateProfile](./update-profile.md), which auto-publishes) first.
{% endhint %}

{% hint style="info" %}
`profile.image` may be a `1sat://txid.vout` URI referencing an inscribed ordinal. To display, build a content URL using `ONESAT_MAINNET_CONTENT_URL`.
{% endhint %}

## Related

- [publishIdentity](./publish-identity.md)
- [updateProfile](./update-profile.md)
- [computeBapId / resolveBapId](./compute-resolve-bap-id.md)
- [Cookbook: BAP Identity Setup](../cookbook/bap-identity-setup.md)
