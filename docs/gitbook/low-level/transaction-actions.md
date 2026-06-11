---
description: The core BRC-100 transaction lifecycle — createAction, signAction, abortAction, internalizeAction.
icon: bolt
---

# Transaction Actions

**Package:** `@bsv/sdk` (`WalletInterface`)
**Access:** `const { wallet } = useWallet();`

The transaction system at the heart of BRC-100. Every signed transaction goes through this lifecycle: build → optionally sign external inputs → broadcast (or hold with `noSend`).

## createAction

```ts
wallet.createAction(input: CreateActionInput): Promise<CreateActionResult>
```

### Input

```ts
interface CreateActionInput {
  description: string;
  inputs?: Array<{
    outpoint: string;
    unlockingScript?: string;       // omit to defer signing to signAction
    inputDescription?: string;
  }>;
  outputs?: Array<{
    lockingScript: string;          // hex
    satoshis: number;
    outputDescription: string;
    basket?: string;
    tags?: string[];
  }>;
  inputBEEF?: number[];             // ancestry for external inputs
  options?: {
    acceptDelayedBroadcast?: boolean;
    noSend?: boolean;               // build & sign without broadcasting
  };
}
```

### Output

```ts
interface CreateActionResult {
  txid?: string;        // populated unless noSend or external signing
  reference?: string;   // handle for signAction / abortAction
  // ... additional fields depending on options
}
```

### Example

```tsx
const result = await wallet.createAction({
  description: 'Send 1000 sats to alice',
  outputs: [{
    lockingScript: '76a914...88ac',
    satoshis: 1000,
    outputDescription: 'payment',
  }],
  options: { acceptDelayedBroadcast: false },
});
console.log('txid:', result.txid);
```

---

## signAction

```ts
wallet.signAction(input: SignActionInput): Promise<SignActionResult>
```

Sign a previously-created action that left some inputs unsigned (`unlockingScript` omitted in `createAction.inputs`).

### Input

```ts
interface SignActionInput {
  reference: string;                        // from createAction
  spends: Record<number, { unlockingScript: string }>;  // keyed by input index
}
```

### Example

```tsx
const signed = await wallet.signAction({
  reference: result.reference!,
  spends: { 0: { unlockingScript: '47...' } },
});
```

---

## abortAction

```ts
wallet.abortAction(input: { reference: string }): Promise<void>
```

Discard a pending action without broadcasting. Use to clean up after the user backs out.

### Example

```tsx
await wallet.abortAction({ reference: result.reference! });
```

---

## internalizeAction

```ts
wallet.internalizeAction(input: InternalizeActionInput): Promise<InternalizeActionResult>
```

Import an externally-built transaction into the wallet (so the wallet knows it owns certain outputs).

### Input

```ts
interface InternalizeActionInput {
  tx: number[];        // BEEF bytes (Array.from(beef))
  outputs: Array<{
    outputIndex: number;
    basket?: string;
    tags?: string[];
    outputDescription?: string;
  }>;
  description: string;
}
```

### Example

```tsx
await wallet.internalizeAction({
  tx: Array.from(beefBytes),
  outputs: [{ outputIndex: 0, basket: 'received', outputDescription: 'invoice 123' }],
  description: 'Received payment from external sender',
});
```

---

## Common pitfalls

{% hint style="warning" %}
`createAction` with `noSend: true` builds and signs but does NOT broadcast. Many flows then call a second pass (e.g. `internalizeAction` on the counterparty) before triggering broadcast. Make sure you actually broadcast somewhere.
{% endhint %}

{% hint style="warning" %}
`internalizeAction` does not validate that the BEEF is correct beyond basic structure. Pass garbage and the wallet may end up tracking a non-existent output.
{% endhint %}

## Related

- [Concept: BRC-100](../concepts/brc-100.md)
- [Concept: BEEF](../concepts/beef.md)
- [Output Management](./output-management.md) — `listOutputs`, `relinquishOutput`
- [Action History](./action-history.md) — `listActions`
