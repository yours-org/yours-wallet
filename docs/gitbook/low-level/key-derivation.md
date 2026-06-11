---
description: BRC-100 / BRC-42 key derivation via wallet.getPublicKey.
icon: key
---

# Key Derivation

**Package:** `@bsv/sdk` (`WalletInterface`)
**Access:** `const { wallet } = useWallet();`

{% hint style="info" %}
Uses [BRC-42](https://github.com/bitcoin-sv/BRCs/blob/master/key-derivation/0042.md) hierarchical key derivation. The wallet derives keys deterministically from `protocolID`, `keyID`, and (optionally) `counterparty`.
{% endhint %}

## getPublicKey

```ts
wallet.getPublicKey(input: GetPublicKeyInput): Promise<{ publicKey: string }>
```

### Input

```ts
interface GetPublicKeyInput {
  protocolID: [number, string];  // [securityLevel, protocolName]
  keyID: string;                 // arbitrary key identifier
  counterparty?: string;         // pubkey hex, 'self', or 'anyone' (default 'self')
  forSelf?: boolean;             // when true, derive a "for me" variant
}
```

`protocolID`:

* `securityLevel`: `0` (no permission needed) | `1` (per-call permission) | `2` (per-permission grant)
* `protocolName`: arbitrary string namespace, e.g. `'social posts'`

`counterparty`:

* `'self'` — derive a key only the wallet can use
* `'anyone'` — derive a publicly-derivable key
* `'02abc...'` — derive a key shared with a specific counterparty (ECDH-based)

### Output

```ts
interface GetPublicKeyResult {
  publicKey: string;  // hex-encoded compressed pubkey
}
```

### Example

```tsx
const { publicKey } = await wallet.getPublicKey({
  protocolID: [1, 'my-protocol'],
  keyID: 'key-1',
  counterparty: '02abc...',
  forSelf: false,
});
```

---

## Common pitfalls

{% hint style="warning" %}
A different `protocolID` or `keyID` derives a different key. If you sign with `[1, 'social posts']` / `key-1` and verify with `[1, 'social posts']` / `key-2`, verification will fail. Pick stable conventions for your app.
{% endhint %}

{% hint style="warning" %}
`counterparty: 'self'` and an explicit pubkey produce DIFFERENT keys, even if that pubkey is the wallet's own identity key. Pick one convention and stick to it.
{% endhint %}

## Related

- [Concept: BRC-100](../concepts/brc-100.md)
- [Cryptography](./cryptography.md) — `createSignature` / `encrypt` / `decrypt` use the same `protocolID` / `keyID` model
- [Key Linkage](./key-linkage.md)
- BRC standard: [BRC-42](https://github.com/bitcoin-sv/BRCs/blob/master/key-derivation/0042.md)
