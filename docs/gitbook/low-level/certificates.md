---
description: BRC-103 certificate operations — acquire, list, prove (selectively), relinquish.
icon: certificate
---

# Certificates

**Package:** `@bsv/sdk` (`WalletInterface`)
**Access:** `const { wallet } = useWallet();`

{% hint style="info" %}
BRC-103 certificate model: a `certifier` issues a certificate to a holder, the holder stores it in their wallet, and verifiers can prove selectively-revealed fields without seeing the others.
{% endhint %}

## acquireCertificate

```ts
wallet.acquireCertificate(input: AcquireCertificateInput): Promise<Certificate>
```

### Input

```ts
interface AcquireCertificateInput {
  type: string;                              // certificate type identifier
  certifier: string;                         // certifier pubkey
  acquisitionProtocol: 'direct' | 'issuance';
  fields: Record<string, string>;            // field name -> value
}
```

### Example

```tsx
const cert = await wallet.acquireCertificate({
  type: 'certificate-type-id',
  certifier: '02certifier-pubkey...',
  acquisitionProtocol: 'direct',
  fields: { name: 'Alice', email: 'alice@example.com' },
});
```

---

## listCertificates

```ts
wallet.listCertificates(input: ListCertificatesInput): Promise<{ certificates: Certificate[] }>
```

### Input

```ts
interface ListCertificatesInput {
  certifiers?: string[];
  types?: string[];
}
```

### Example

```tsx
const { certificates } = await wallet.listCertificates({
  certifiers: ['02certifier...'],
  types: ['type-id'],
});
```

---

## proveCertificate

```ts
wallet.proveCertificate(input: ProveCertificateInput): Promise<CertificateProof>
```

Generate a proof that reveals only selected fields to a verifier.

### Input

```ts
interface ProveCertificateInput {
  certificate: Certificate;
  fieldsToReveal: string[];   // names of fields to disclose
  verifier: string;           // verifier pubkey
}
```

### Example

```tsx
const proof = await wallet.proveCertificate({
  certificate: cert,
  fieldsToReveal: ['name'],   // hide email, show name
  verifier: '02verifier-pubkey...',
});
// Send `proof` to the verifier.
```

---

## relinquishCertificate

```ts
wallet.relinquishCertificate(input: RelinquishCertificateInput): Promise<void>
```

Remove a certificate from the wallet.

### Input

```ts
interface RelinquishCertificateInput {
  type: string;
  serialNumber: string;
  certifier: string;
}
```

### Example

```tsx
await wallet.relinquishCertificate({
  type: 'type-id',
  serialNumber: cert.serialNumber,
  certifier: cert.certifier,
});
```

---

## Common pitfalls

{% hint style="warning" %}
`proveCertificate` reveals exactly the fields listed in `fieldsToReveal`. Double-check the field names match the certificate's actual field schema — typos result in unverifiable proofs.
{% endhint %}

{% hint style="info" %}
Certificates are scoped to a verifier. The same certificate can be proven separately to multiple verifiers with different field selections.
{% endhint %}

## Related

- [Discovery](./discovery.md) — find certificates by identity or attribute
- [Key Linkage](./key-linkage.md)
- BRC standard: [BRC-103](https://github.com/bitcoin-sv/BRCs/blob/master/peer-to-peer/0103.md)
