---
description: Derive a per-protocol public key that a friend can compute identically — the basis for shared-secret crypto.
icon: user-group
---

# getFriendPublicKey

**Package:** `@1sat/actions`
**Category:** Signing

Returns the public key that BOTH parties will derive when running the same `protocolID` + `keyID` against each other's identity keys. Both sides see the same key, so you can use it as a shared encryption / signing reference.

## Signature

```ts
getFriendPublicKey.execute(ctx: OneSatContext, input: FriendPubKeyRequest): Promise<FriendPubKeyResponse>
```

## Input

```ts
interface FriendPubKeyRequest {
  /** The friend's identity public key (33-byte compressed hex) */
  friendIdentityKey: string;
  /** BRC-42 protocol — [securityLevel, protocolName] */
  protocolID: [number, string];
  /** BRC-42 key ID */
  keyID: string;
}
```

## Output

```ts
interface FriendPubKeyResponse {
  publicKey?: string;   // derived shared key, hex-encoded compressed
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- The friend's identity key known (e.g. resolved via BAP or out-of-band)

## Permission prompts

- `getPublicKey`

## Example

```tsx
import { getFriendPublicKey } from '@1sat/actions';

const result = await getFriendPublicKey.execute(ctx, {
  friendIdentityKey: '02abc...friend-identity-key',
  protocolID: [1, 'social messaging'],
  keyID: 'thread-42',
});
if (result.error) throw new Error(result.error);

console.log('Shared key:', result.publicKey);
```

## Common pitfalls

{% hint style="warning" %}
Both parties MUST use the same `protocolID` and `keyID` for the derived keys to match. Pick a stable convention and document it.
{% endhint %}

{% hint style="info" %}
`friendIdentityKey` is the friend's BAP identity public key — get it from `getProfile` on their side, a BAP resolver, or your own user directory.
{% endhint %}

## Use cases

- Derive a stable per-conversation key for end-to-end encryption
- Establish a shared signing key for joint attestations
- Per-relationship key derivation without on-chain key publication

## Related

- [encrypt-decrypt](./encrypt-decrypt.md) — encrypt with `counterparty` set to the friend identity
- [Key Derivation (low-level)](../low-level/key-derivation.md)
