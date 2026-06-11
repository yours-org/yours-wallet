---
description: Sign a message using Bitcoin Signed Message (BSM). Supports utf8 / hex / base64 encodings and derivation tags.
icon: signature
---

# signBsm

**Package:** `@1sat/actions`
**Category:** Signing

## Signature

```ts
signBsm.execute(ctx: OneSatContext, input: SignBsmRequest): Promise<SignBsmResponse>
```

## Input

```ts
interface SignBsmRequest {
  /** Message to sign */
  message: string;
  /** Encoding of `message`. Default 'utf8'. */
  encoding?: 'utf8' | 'hex' | 'base64';
  /** Optional derivation tag — picks a specific signing key */
  tag?: {
    label: string;
    id: string;
    domain: string;
    meta: Record<string, string>;
  };
}
```

## Output

```ts
interface SignBsmResponse {
  address?: string; // signer address
  pubKey?: string; // signer compressed pubkey (hex)
  message?: string; // echoed message
  sig?: string; // base64-encoded BSM signature
  derivationTag?: SignBsmRequest['tag']; // echoed tag if provided
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- `createSignature`

## Example

Default UTF-8 signing:

```tsx
import { signBsm } from '@1sat/actions';

const result = await signBsm.execute(ctx, {
  message: 'Hello, world!',
});
if (result.error) throw new Error(result.error);

console.log('Signature:', result.sig);
console.log('Signer address:', result.address);
console.log('Signer pubkey:', result.pubKey);
```

Sign a hex-encoded payload with a derivation tag:

```tsx
const result = await signBsm.execute(ctx, {
  message: 'deadbeef',
  encoding: 'hex',
  tag: {
    label: 'API key proof',
    id: 'apikey-2025',
    domain: 'myapp.com',
    meta: { purpose: 'authentication' },
  },
});
```

## Common pitfalls

{% hint style="info" %}
Pass the **encoded** message — the SDK handles the standard BSM "Bitcoin Signed Message:\n" prefix and length encoding before hashing. Do NOT pre-hash.
{% endhint %}

{% hint style="warning" %}
`encoding` must match how the message is actually encoded. A UTF-8 string passed with `encoding: 'hex'` will be misinterpreted.
{% endhint %}

{% hint style="info" %}
Verifiers must use a BSM-compatible verifier (e.g. the `bsm.verify` helper in `@bsv/sdk`). They cannot use raw ECDSA verification.
{% endhint %}

## Use cases

- Login flows (sign a server-provided nonce)
- Provable consent ("I authorize X")
- Tying off-chain data to an on-chain address

## Related

- [getAuthToken](./get-auth-token.md) — opinionated auth token wrapper
- [Concept: Permissions](../concepts/permissions.md)
- [Cryptography (low-level)](../low-level/cryptography.md)
