---
description: Every wallet operation may prompt the user. How to handle approval, denial, and account switches.
icon: shield-halved
---

# Permissions

Yours Wallet uses a `WalletPermissionsManager` to gate every operation that signs, creates, or modifies state. From the user's perspective they see in-wallet prompts; from the dApp's perspective they get either a successful result or an error.

## The model

Operations fall into permission buckets:

| Bucket               | When prompted                                           |
| -------------------- | ------------------------------------------------------- |
| `createAction`       | Any action that creates / broadcasts a transaction      |
| `createSignature`    | Message signing, encryption                             |
| `getPublicKey`       | First time accessing a derived key for a protocol/keyID |
| `acquireCertificate` | Certificate operations                                  |
| `revealKeyLinkage`   | Privacy-sensitive linkage proofs                        |

Each prompt may be a one-time grant or a session-long grant, depending on the user's choice in the wallet UI.

## Handling rejection

When the user denies a prompt, the action returns `error: 'user-rejected'` (or throws — depends on the action):

```tsx
const result = await sendBsv.execute(ctx, { requests: [...] });
if (result.error === 'user-rejected') {
  // surface a friendly message; let them retry
  return;
}
```

{% hint style="info" %}
Always design your UI to recover gracefully. Users sometimes click reject by mistake, or want to inspect the prompt and try again.
{% endhint %}

## Account switching

If the user switches accounts in the wallet (multi-account is supported), a `switchAccount` event fires:

```tsx
useEffect(() => {
  const handler = (e: any) => {
    const { action } = e.detail;
    if (action === 'switchAccount') {
      disconnect();
      setTimeout(() => connect(), 500);
    }
    if (action === 'signedOut') disconnect();
  };
  window.addEventListener('YoursEmitEvent', handler);
  return () => window.removeEventListener('YoursEmitEvent', handler);
}, [disconnect, connect]);
```

See [Events](../reference/events.md) for the full event reference and [Multi-Account Handling](../cookbook/multi-account-handling.md) for a complete recipe.

## Sign-out

The user can sign out of the wallet at any time. A `signedOut` event fires; respond by calling `disconnect()` and clearing any in-memory user state.

## Detecting connection state

`useWallet()` exposes `status`:

```ts
type WalletStatus = 'disconnected' | 'detecting' | 'selecting' | 'connecting' | 'connected';
```

Check `status === 'connected'` before calling any action.

## Storage payment

A subtle permission case: if the wallet's remote storage is metered and the user runs out of paid storage, the SDK throws `storage-payment-failed`. The user needs to top up their BSV balance.

```tsx
try {
  const r = await sendBsv.execute(ctx, { requests: [...] });
} catch (err) {
  if ((err as any)?.code === 'storage-payment-failed') {
    // ask user to add funds
  }
}
```

## Related

- [Errors](../reference/errors.md) — `user-rejected`, `storage-payment-failed`, etc.
- [Events](../reference/events.md) — `signedOut`, `switchAccount`
- [Multi-Account Handling](../cookbook/multi-account-handling.md) — keying caches by identityKey
- [Event Listening](../cookbook/event-listening.md) — listener patterns
