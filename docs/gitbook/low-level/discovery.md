---
description: Find users and certificates on overlay networks by identity key or attribute.
icon: magnifying-glass
---

# Discovery

**Package:** `@bsv/sdk` (`WalletInterface`)
**Access:** `const { wallet } = useWallet();`

{% hint style="info" %}
Discovery queries overlay services (configured per wallet) to find users and the certificates they publish. Results depend on which overlays the wallet is connected to.
{% endhint %}

## discoverByIdentityKey

```ts
wallet.discoverByIdentityKey(input: DiscoverByIdentityKeyInput): Promise<DiscoveryResult[]>
```

### Input

```ts
interface DiscoverByIdentityKeyInput {
  identityKey: string; // pubkey to look up
  limit?: number;
}
```

### Example

```tsx
const results = await wallet.discoverByIdentityKey({
  identityKey: '02abc...',
  limit: 10,
});
```

---

## discoverByAttributes

```ts
wallet.discoverByAttributes(input: DiscoverByAttributesInput): Promise<DiscoveryResult[]>
```

### Input

```ts
interface DiscoverByAttributesInput {
  attributes: Record<string, string>; // attribute name -> value
  limit?: number;
}
```

### Example

```tsx
const results = await wallet.discoverByAttributes({
  attributes: { name: 'Alice' },
  limit: 10,
});
```

---

## Common pitfalls

{% hint style="warning" %}
Discovery is overlay-network dependent. A user not published to any overlay the wallet knows about is invisible. Do not treat empty results as "user does not exist."
{% endhint %}

{% hint style="info" %}
Attribute matching semantics (exact vs. fuzzy) vary by overlay. Test against the overlays you actually rely on.
{% endhint %}

## Related

- [Certificates](./certificates.md)
- [Key Linkage](./key-linkage.md)
