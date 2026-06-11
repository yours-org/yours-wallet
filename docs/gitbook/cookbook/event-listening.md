---
description: React to wallet-emitted events — signedOut and switchAccount.
icon: signal
---

# Event Listening

**Goal:** Subscribe to wallet events so the app reacts when the user signs out or switches accounts.

## The event model

Yours Wallet dispatches `CustomEvent` instances on `window` under the name `YoursEmitEvent`. The discriminator is `e.detail.action`:

| `action`        | Meaning                       | Recommended response                                      |
| --------------- | ----------------------------- | --------------------------------------------------------- |
| `signedOut`     | User signed out of the wallet | Call `disconnect()` and clear app state                   |
| `switchAccount` | User switched accounts        | Call `disconnect()`, then `connect()` after a short delay |

## Basic listener

```tsx
import { useEffect } from 'react';
import { useWallet } from '@1sat/react';

function WalletEventListener() {
  const { connect, disconnect } = useWallet();

  useEffect(() => {
    const handler = (e: Event) => {
      const { action } = (e as CustomEvent).detail;
      if (action === 'signedOut') {
        disconnect();
      }
      if (action === 'switchAccount') {
        disconnect();
        setTimeout(() => connect(), 500);
      }
    };

    window.addEventListener('YoursEmitEvent', handler);
    return () => window.removeEventListener('YoursEmitEvent', handler);
  }, [connect, disconnect]);

  return null;
}
```

Mount `<WalletEventListener />` inside your `WalletProvider`.

## Why the 500ms delay on switchAccount

When the user switches accounts, the wallet emits the event before its internal state is fully ready for a new connection. Immediately calling `connect()` can race; a short delay (250-500ms) is enough to settle.

## Clearing app state

A `switchAccount` event means the active identity has changed — any cached data tied to the previous identity must be evicted. See [Multi-Account Handling](./multi-account-handling.md).

```tsx
function WalletEventListener() {
  const { connect, disconnect, identityKey } = useWallet();
  const clearAppState = useClearAppState();

  useEffect(() => {
    const handler = (e: Event) => {
      const { action } = (e as CustomEvent).detail;
      if (action === 'signedOut') {
        clearAppState();
        disconnect();
      }
      if (action === 'switchAccount') {
        clearAppState();
        disconnect();
        setTimeout(() => connect(), 500);
      }
    };
    window.addEventListener('YoursEmitEvent', handler);
    return () => window.removeEventListener('YoursEmitEvent', handler);
  }, [clearAppState, connect, disconnect]);

  return null;
}
```

## Common pitfalls

{% hint style="warning" %}
Always clean up the listener in the `useEffect` return. Otherwise navigating between routes will accumulate duplicate handlers, each calling `disconnect()` multiple times.
{% endhint %}

{% hint style="warning" %}
Do not call `connect()` synchronously inside the `signedOut` handler. The user just signed out — they will see another prompt and be confused. Only auto-reconnect on `switchAccount`.
{% endhint %}

## See also

- [Reference: Events](../reference/events.md)
- [Multi-Account Handling](./multi-account-handling.md)
- [Concept: Permissions](../concepts/permissions.md)
