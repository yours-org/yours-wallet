---
description: Encrypt or decrypt byte arrays to/from a counterparty using ECDH-derived keys.
icon: shield-halved
---

# encryptForCounterparty / decryptFromCounterparty

**Package:** `@1sat/actions`
**Category:** Signing

End-to-end encryption between the wallet and a counterparty identified by their compressed public key. Both inputs and outputs use **byte arrays** (`number[]`), not strings.

## encryptForCounterparty

### Signature

```ts
encryptForCounterparty.execute(ctx: OneSatContext, input: EncryptRequest): Promise<EncryptResponse>
```

### Input

```ts
interface EncryptRequest {
  plaintext: number[]; // byte array, e.g. [...new TextEncoder().encode('hi')]
  protocolID: [number, string]; // BRC-42 protocol
  keyID: string; // BRC-42 key id
  counterparty: string; // recipient pubkey (33-byte compressed hex)
}
```

### Output

```ts
interface EncryptResponse {
  ciphertext?: number[]; // byte array
  error?: string;
}
```

### Example

```tsx
import { encryptForCounterparty } from '@1sat/actions';

const plaintext = [...new TextEncoder().encode('secret message')];

const result = await encryptForCounterparty.execute(ctx, {
  plaintext,
  protocolID: [1, 'social messaging'],
  keyID: 'thread-42',
  counterparty: '02recipient-pubkey...',
});
if (result.error) throw new Error(result.error);
console.log('Ciphertext bytes:', result.ciphertext);
```

---

## decryptFromCounterparty

### Signature

```ts
decryptFromCounterparty.execute(ctx: OneSatContext, input: DecryptRequest): Promise<DecryptResponse>
```

### Input

```ts
interface DecryptRequest {
  ciphertext: number[];
  protocolID: [number, string];
  keyID: string;
  counterparty: string; // sender pubkey
}
```

### Output

```ts
interface DecryptResponse {
  plaintext?: number[];
  error?: string;
}
```

### Example

```tsx
import { decryptFromCounterparty } from '@1sat/actions';

const result = await decryptFromCounterparty.execute(ctx, {
  ciphertext: ciphertextBytes,
  protocolID: [1, 'social messaging'],
  keyID: 'thread-42',
  counterparty: '02sender-pubkey...',
});
if (result.error) throw new Error(result.error);

const text = new TextDecoder().decode(new Uint8Array(result.plaintext!));
console.log('Plaintext:', text);
```

## Preconditions (both)

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Counterparty's compressed pubkey known

## Permission prompts

- `encrypt` / `decrypt`

## Common pitfalls

{% hint style="danger" %}
`plaintext` and `ciphertext` are **byte arrays** (`number[]`), NOT strings. Convert with `[...new TextEncoder().encode(s)]` and `new TextDecoder().decode(new Uint8Array(arr))`.
{% endhint %}

{% hint style="warning" %}
For round-trip success, the sender and recipient must use the SAME `protocolID`, `keyID`, AND each other's pubkey as `counterparty`. Any drift breaks decryption silently.
{% endhint %}

{% hint style="warning" %}
`counterparty` is a **33-byte compressed pubkey** as a 66-character hex string (`02...` or `03...`). Uncompressed pubkeys (65 bytes, `04...`) will be rejected.
{% endhint %}

## Errors

| Code                   | Cause                                                       |
| ---------------------- | ----------------------------------------------------------- |
| `user-rejected`        | User denied the wallet prompt                               |
| `invalid-counterparty` | Bad pubkey hex                                              |
| `invalid-ciphertext`   | Ciphertext corrupted or wrong counterparty/protocolID/keyID |

## Related

- [getFriendPublicKey](./get-friend-public-key.md) — derive the shared key
- [Cryptography (low-level)](../low-level/cryptography.md) — raw `wallet.encrypt` / `wallet.decrypt`
