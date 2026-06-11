---
description: Publish a social post on-chain via the wallet's identity.
icon: comment
---

# createSocialPost

**Package:** `@1sat/actions`
**Category:** Social

## Signature

```ts
createSocialPost.execute(ctx: OneSatContext, input: CreateSocialPostInput): Promise<CreateSocialPostResult>
```

## Input

```ts
interface CreateSocialPostInput {
  content: string; // post body
  app: string; // app namespace, e.g. 'my-social-app'
}
```

## Output

```ts
interface CreateSocialPostResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet (typically with a published BAP identity, so the post is attributable)
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Small BSV reserve for inscription fee

## Permission prompts

- `createAction`

## Example

```tsx
import { createSocialPost } from '@1sat/actions';

const result = await createSocialPost.execute(ctx, {
  content: 'Hello BSV!',
  app: 'my-social-app',
});
if (result.error) throw new Error(result.error);
console.log('Post txid:', result.txid);
```

## Common pitfalls

{% hint style="danger" %}
The post is written on-chain. Deletion is not possible. Validate `content` (length, profanity, accidental secrets) BEFORE prompting the user.
{% endhint %}

{% hint style="info" %}
`app` namespaces the post so multiple social dApps can co-exist on-chain without collision. Pick a stable, app-specific identifier.
{% endhint %}

## Errors

| Code                 | Cause                         |
| -------------------- | ----------------------------- |
| `user-rejected`      | User denied the wallet prompt |
| `insufficient-funds` | Not enough BSV                |
| `invalid-content`    | Content invalid (e.g. empty)  |

## Related

- [publishIdentity](./publish-identity.md) — recommended before posting (attributes posts to the identity)
- [inscribe](./inscribe.md) — for non-social inscriptions
