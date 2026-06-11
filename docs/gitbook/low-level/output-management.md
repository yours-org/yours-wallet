---
description: List and relinquish outputs from baskets.
icon: list
---

# Output Management

**Package:** `@bsv/sdk` (`WalletInterface`)
**Access:** `const { wallet } = useWallet();`

{% hint style="info" %}
Outputs are organized in named baskets and may carry tags. See [Baskets & Tags](../concepts/baskets-and-tags.md) for the model.
{% endhint %}

## listOutputs

```ts
wallet.listOutputs(input: ListOutputsInput): Promise<{ outputs: WalletOutput[] }>
```

### Input

```ts
interface ListOutputsInput {
  basket: string;
  tags?: string[];
  includeTags?: boolean;
  include?: 'locking scripts';
  limit?: number;
}
```

### Output

```ts
interface WalletOutput {
  outpoint: string; // "txid.vout"
  satoshis: number;
  spendable: boolean;
  tags?: string[];
  labels?: string[];
  lockingScript?: string; // when include: 'locking scripts'
  customInstructions?: string;
}
```

### Example

```tsx
const { outputs } = await wallet.listOutputs({
  basket: 'my-basket',
  tags: ['type:data'],
  includeTags: true,
  limit: 100,
});
```

With locking scripts (larger payload):

```tsx
const { outputs } = await wallet.listOutputs({
  basket: 'default',
  include: 'locking scripts',
  limit: 50,
});
```

---

## relinquishOutput

Remove an output from a basket. Use to garbage-collect outputs the wallet no longer needs to track.

```ts
wallet.relinquishOutput(input: RelinquishOutputInput): Promise<void>
```

### Input

```ts
interface RelinquishOutputInput {
  basket: string;
  output: string; // outpoint "txid.vout"
}
```

### Example

```tsx
await wallet.relinquishOutput({
  basket: 'my-basket',
  output: 'txid.vout',
});
```

---

## Common pitfalls

{% hint style="warning" %}
`relinquishOutput` does NOT spend the output on-chain — it just stops the wallet from tracking it. If you want to actually spend, use `createAction` with the output as an input.
{% endhint %}

{% hint style="info" %}
`include: 'locking scripts'` significantly increases response size. Only request when you actually need the scripts (e.g. for custom unlocking flows).
{% endhint %}

## Related

- [Concept: Baskets & Tags](../concepts/baskets-and-tags.md)
- [listOutputs (action)](../actions/list-outputs.md) — the same method viewed from a payments angle
- [Transaction Actions](./transaction-actions.md) — `createAction` for spending
- [Types: WalletOutput](../reference/types.md)
