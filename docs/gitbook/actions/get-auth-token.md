---
description: Get a request-scoped auth token signed by the wallet's identity.
icon: key
---

# getAuthToken

**Package:** `@1sat/actions`
**Category:** Signing

Produces a token your backend can verify to confirm the request came from a particular wallet identity. The token is bound to a specific request path and optional body.

## Signature

```ts
getAuthToken.execute(ctx: OneSatContext, input: AuthTokenRequest): Promise<AuthTokenResponse>
```

## Input

```ts
interface AuthTokenRequest {
  /** Request path (or URL) the token authorizes — e.g. '/api/orders/123' */
  requestPath: string;
  /** Optional request body to bind into the signature */
  body?: string;
  /** Encoding of `body`. Default 'utf8'. */
  bodyEncoding?: 'utf8' | 'hex' | 'base64';
  /** Optional override for the signed timestamp (ISO 8601). Default: now. */
  timestamp?: string;
}
```

## Output

```ts
interface AuthTokenResponse {
  authToken?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- `createSignature`

## Example

```tsx
import { getAuthToken } from '@1sat/actions';

const result = await getAuthToken.execute(ctx, {
  requestPath: '/api/orders/123',
  body: JSON.stringify({ qty: 5 }),
  bodyEncoding: 'utf8',
});
if (result.error) throw new Error(result.error);

await fetch('/api/orders/123', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bitcoin-Auth ${result.authToken}`,
  },
  body: JSON.stringify({ qty: 5 }),
});
```

## Common pitfalls

{% hint style="danger" %}
The token is scoped to `requestPath` AND `body`. Your backend MUST verify both — replaying a token signed for `/api/foo` against `/api/bar`, or signed for one body against a different body, should fail validation.
{% endhint %}

{% hint style="warning" %}
`bodyEncoding` must match how the body is actually encoded on the wire. Mismatched encodings produce valid-looking tokens that fail server-side verification.
{% endhint %}

{% hint style="info" %}
Backend verification: extract the timestamp and signer from the token, then re-derive the canonical message from `requestPath + body` and verify the signature against the user's identity key.
{% endhint %}

## Use cases

- API authentication tied to wallet identity (instead of cookies/JWTs)
- Per-request authorization that cannot be replayed across endpoints
- Server-side proof that a particular wallet owner made a request

## Related

- [signBsm](./sign-bsm.md) — lower-level message signing
- [getProfile](./get-profile.md) — identity context
- [Concept: Permissions](../concepts/permissions.md)
