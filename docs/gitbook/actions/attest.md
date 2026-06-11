---
description: Publish a BAP attestation for a given URN hash.
icon: stamp
---

# attest

**Package:** `@1sat/actions`
**Category:** Identity

## Signature

```ts
attest.execute(ctx: OneSatContext, input: AttestInput): Promise<AttestResult>
```

## Input

```ts
interface AttestInput {
  attestationHash: string;  // sha256 of the URN being attested
  counter: string;          // monotonically increasing per-subject counter
}
```

## Output

```ts
interface AttestResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet with a published identity
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- The URN has been hashed correctly (sha256)

## Permission prompts

- `createAction`

## Example

```tsx
import { attest } from '@1sat/actions';

const result = await attest.execute(ctx, {
  attestationHash: 'a1b2c3...sha256...',
  counter: '0',
});
if (result.error) throw new Error(result.error);
```

## Common pitfalls

{% hint style="warning" %}
`attestationHash` is the **sha256 of the URN string**, not the URN itself. Hash before passing.
{% endhint %}

{% hint style="info" %}
`counter` should be unique per subject. Re-using a counter for a different attestation on the same subject is a protocol violation.
{% endhint %}

## Use cases

- BAP attestations confirming that a user has been verified for KYC
- On-chain proof that the identity has reviewed/endorsed a particular data record

## Related

- [publishIdentity](./publish-identity.md)
- [getProfile](./get-profile.md)
