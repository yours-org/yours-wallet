---
description: Wallet-managed cryptography — signatures, HMAC, encryption, decryption.
icon: shield-halved
---

# Cryptography

**Package:** `@bsv/sdk` (`WalletInterface`)
**Access:** `const { wallet } = useWallet();`

{% hint style="info" %}
All operations are keyed by `protocolID` + `keyID` + (optional) `counterparty`. The wallet derives the actual key under [BRC-42](https://github.com/bitcoin-sv/BRCs/blob/master/key-derivation/0042.md). For encrypt/decrypt to round-trip, both sides must use matching parameters.
{% endhint %}

## createSignature

```ts
wallet.createSignature(input: CreateSignatureInput): Promise<{ signature: number[] }>
```

### Input

```ts
interface CreateSignatureInput {
  data: number[];                // bytes to sign
  protocolID: [number, string];
  keyID: string;
  counterparty?: string;
}
```

### Example

```tsx
const { signature } = await wallet.createSignature({
  data: [1, 2, 3],
  protocolID: [1, 'my-protocol'],
  keyID: 'signing-key',
});
```

---

## verifySignature

```ts
wallet.verifySignature(input: VerifySignatureInput): Promise<{ valid: boolean }>
```

### Input

```ts
interface VerifySignatureInput {
  data: number[];
  signature: number[];
  protocolID: [number, string];
  keyID: string;
  counterparty?: string;
}
```

### Example

```tsx
const { valid } = await wallet.verifySignature({
  data: [1, 2, 3],
  signature: signature,
  protocolID: [1, 'my-protocol'],
  keyID: 'signing-key',
  counterparty: '02abc...',
});
```

---

## createHmac

```ts
wallet.createHmac(input: CreateHmacInput): Promise<{ hmac: number[] }>
```

### Input

```ts
interface CreateHmacInput {
  data: number[];
  protocolID: [number, string];
  keyID: string;
}
```

### Example

```tsx
const { hmac } = await wallet.createHmac({
  data: [1, 2, 3],
  protocolID: [1, 'my-protocol'],
  keyID: 'hmac-key',
});
```

---

## encrypt

```ts
wallet.encrypt(input: EncryptInput): Promise<{ ciphertext: number[] }>
```

### Input

```ts
interface EncryptInput {
  plaintext: number[];
  protocolID: [number, string];
  keyID: string;
  counterparty: string;  // pubkey
}
```

### Example

```tsx
const { ciphertext } = await wallet.encrypt({
  plaintext: [72, 101, 108, 108, 111],  // "Hello"
  protocolID: [1, 'my-protocol'],
  keyID: 'enc-key',
  counterparty: '02abc...',
});
```

---

## decrypt

```ts
wallet.decrypt(input: DecryptInput): Promise<{ plaintext: number[] }>
```

### Input

```ts
interface DecryptInput {
  ciphertext: number[];
  protocolID: [number, string];
  keyID: string;
  counterparty: string;
}
```

### Example

```tsx
const { plaintext } = await wallet.decrypt({
  ciphertext: ciphertext,
  protocolID: [1, 'my-protocol'],
  keyID: 'enc-key',
  counterparty: '02abc...',
});
```

---

## Common pitfalls

{% hint style="danger" %}
For encrypt/decrypt to round-trip, the sender and recipient must use the SAME `protocolID`, `keyID`, AND each other's pubkey as `counterparty`. Drift in any field breaks decryption.
{% endhint %}

{% hint style="warning" %}
`data`, `plaintext`, `signature`, `ciphertext`, and `hmac` are all `number[]` (byte arrays). Convert from strings with `[...new TextEncoder().encode(s)]` and back with `new TextDecoder().decode(new Uint8Array(arr))`.
{% endhint %}

## Related

- [Key Derivation](./key-derivation.md)
- [Concept: Permissions](../concepts/permissions.md)
- [signBsm](../actions/sign-bsm.md) — opinionated BSM wrapper
- [encrypt-decrypt action](../actions/encrypt-decrypt.md) — opinionated wrapper
