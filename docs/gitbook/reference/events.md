---
description: YoursEmitEvent reference — wallet-emitted custom events that the dApp can subscribe to.
icon: signal
---

# Events

Yours Wallet dispatches `CustomEvent` instances on `window` under the name `YoursEmitEvent`. The discriminator is `e.detail.action`.

## Event types

| `action`        | When emitted                            | Recommended response                               |
| --------------- | --------------------------------------- | -------------------------------------------------- |
| `signedOut`     | User signed out of the wallet extension | Call `disconnect()`; clear app state               |
| `switchAccount` | User switched to a different account    | Call `disconnect()`, wait ~500ms, call `connect()` |

## Listener pattern

```tsx
import { useEffect } from 'react';
import { useWallet } from '@1sat/react';

function WalletEvents() {
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

Mount inside your `WalletProvider`.

## Why the delay on `switchAccount`

When the user switches accounts, the wallet emits the event before its internal state is fully ready for a new connection. Calling `connect()` immediately can race. A 250-500ms delay is typically sufficient.

## Common pitfalls

{% hint style="warning" %}
Always clean up the listener (`return () => window.removeEventListener(...)`). Otherwise route changes accumulate handlers and you get duplicate disconnect/connect cycles.
{% endhint %}

{% hint style="warning" %}
Do NOT auto-call `connect()` on `signedOut` — the user explicitly signed out. Prompting them to reconnect is hostile UX.
{% endhint %}

{% hint style="info" %}
On `switchAccount`, all cached state tied to the previous account must be cleared. See [Multi-Account Handling](../cookbook/multi-account-handling.md).
{% endhint %}

## Future events

The event name (`YoursEmitEvent`) is stable, but the set of `action` values may grow as the wallet evolves. Code defensively against unknown `action` values — ignore them rather than throwing.

```tsx
const handler = (e: Event) => {
  const { action } = (e as CustomEvent).detail;
  switch (action) {
    case 'signedOut':
      /* ... */ break;
    case 'switchAccount':
      /* ... */ break;
    default:
      /* ignore unknown events */ break;
  }
};
```

## See also

- [Cookbook: Event Listening](../cookbook/event-listening.md)
- [Cookbook: Multi-Account Handling](../cookbook/multi-account-handling.md)
- [Concept: Permissions](../concepts/permissions.md)
