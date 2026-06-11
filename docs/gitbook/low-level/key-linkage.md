---
description: Privacy-preserving proofs that two derived keys belong to the same identity.
icon: link
---

# Key Linkage

**Package:** `@bsv/sdk` (`WalletInterface`)
**Access:** `const { wallet } = useWallet();`

{% hint style="info" %}
Key linkage proofs let a verifier confirm that two derived keys originated from the same identity, without leaking the identity key itself. Used in privacy-preserving identity flows.
{% endhint %}

## revealCounterpartyKeyLinkage

```ts
wallet.revealCounterpartyKeyLinkage(input: RevealCounterpartyKeyLinkageInput): Promise<KeyLinkageProof>
```

Prove that a key derived for a specific counterparty is linked to the wallet's identity.

### Input

```ts
interface RevealCounterpartyKeyLinkageInput {
  counterparty: string;  // pubkey
  verifier: string;      // pubkey of the party who will verify
}
```

### Example

```tsx
const linkage = await wallet.revealCounterpartyKeyLinkage({
  counterparty: '02counterparty-pubkey...',
  verifier: '02verifier-pubkey...',
});
// Send `linkage` to the verifier.
```

---

## revealSpecificKeyLinkage

```ts
wallet.revealSpecificKeyLinkage(input: RevealSpecificKeyLinkageInput): Promise<KeyLinkageProof>
```

Prove linkage for a specific `(protocolID, keyID, counterparty)` derived key.

### Input

```ts
interface RevealSpecificKeyLinkageInput {
  counterparty: string;
  verifier: string;
  protocolID: [number, string];
  keyID: string;
}
```

### Example

```tsx
const linkage = await wallet.revealSpecificKeyLinkage({
  counterparty: '02counterparty-pubkey...',
  verifier: '02verifier-pubkey...',
  protocolID: [1, 'my-protocol'],
  keyID: 'key-1',
});
```

---

## Common pitfalls

{% hint style="danger" %}
Linkage proofs are sensitive — they tie together derived keys that the user may have intended to keep separate. Only generate when the user has consented to revealing the relationship.
{% endhint %}

{% hint style="warning" %}
The proof is scoped to a specific `verifier`. Passing it to a different verifier will not validate.
{% endhint %}

## Related

- [Key Derivation](./key-derivation.md)
- [Discovery](./discovery.md)
- [Concept: Permissions](../concepts/permissions.md)
