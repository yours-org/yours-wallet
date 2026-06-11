---
description: Query the wallet's history of past actions, filtered by label.
icon: clock-rotate-left
---

# Action History

**Package:** `@bsv/sdk` (`WalletInterface`)
**Access:** `const { wallet } = useWallet();`

## listActions

```ts
wallet.listActions(input: ListActionsInput): Promise<{ actions: Action[] }>
```

### Input

```ts
interface ListActionsInput {
  labels?: string[]; // filter to actions carrying these labels
  limit?: number;
}
```

### Output

```ts
interface Action {
  txid: string;
  description: string;
  labels?: string[];
  timestamp?: number;
  // additional fields per BRC-100 spec
}
```

### Example

```tsx
const { actions } = await wallet.listActions({
  labels: ['my-label'],
  limit: 50,
});
for (const a of actions) {
  console.log(a.timestamp, a.description, a.txid);
}
```

---

## Use cases

- App-specific activity feed (filter by your app's label convention)
- Auditing what the user has signed via your dApp
- Reconciliation against your backend's records

## Common pitfalls

{% hint style="info" %}
Action history is the wallet's local record of what IT created. Transactions received from external sources via `internalizeAction` may or may not appear here depending on the wallet's implementation — do not treat this as a complete on-chain audit.
{% endhint %}

{% hint style="warning" %}
Labels are app-defined strings. Pick a stable, app-specific prefix (e.g. `myapp:`) to avoid collisions with other dApps the user uses.
{% endhint %}

## Related

- [Transaction Actions](./transaction-actions.md) — `createAction` accepts `labels` per-output
- [Output Management](./output-management.md)
- [Concept: BRC-100](../concepts/brc-100.md)
