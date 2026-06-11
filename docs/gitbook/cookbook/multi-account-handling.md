---
description: Handle users who switch between multiple accounts in the wallet without leaking state.
icon: users
---

# Multi-Account Handling

**Goal:** When the user switches accounts, ensure your app's cached data (balances, ordinals, profile, etc.) does not leak between accounts.

## The problem

Yours Wallet supports multiple accounts under one extension install. When the user switches accounts:

1. The active `identityKey` changes.
2. The set of owned ordinals, BSV balances, MNEE balances, and BAP profile all change.
3. The wallet emits a `switchAccount` event (see [Event Listening](./event-listening.md)).

If your app caches data without keying by identity, the new account sees the previous account's data — a privacy and correctness bug.

## The solution: key caches by `identityKey`

```tsx
import { useWallet } from '@1sat/react';

function useOrdinals() {
  const { identityKey } = useWallet();
  return useQuery({
    queryKey: ['ordinals', identityKey],   // <-- include identityKey
    queryFn: () => getOrdinals.execute(ctx, {}),
    enabled: !!identityKey,
  });
}
```

When `identityKey` changes, React Query (or any other caching library that keys on the array) invalidates the prior account's cache.

## React state pattern

If you are not using a query library:

```tsx
function useOrdinalsState(ctx: any) {
  const { identityKey } = useWallet();
  const [ordinals, setOrdinals] = useState<WalletOutput[]>([]);

  useEffect(() => {
    if (!identityKey || !ctx) {
      setOrdinals([]);   // clear when no account
      return;
    }
    let cancelled = false;
    (async () => {
      const { outputs } = await getOrdinals.execute(ctx, {});
      if (!cancelled) setOrdinals(outputs);
    })();
    return () => { cancelled = true; };
  }, [identityKey, ctx]);

  return ordinals;
}
```

The `identityKey` dependency causes the effect to re-fire on account switch, and the cleanup prevents stale data from a previous account leaking into the new one.

## Handling the event itself

Listen for `switchAccount` to trigger a connect cycle. See [Event Listening](./event-listening.md) for the listener pattern.

```tsx
useEffect(() => {
  const handler = (e: Event) => {
    const { action } = (e as CustomEvent).detail;
    if (action === 'switchAccount') {
      disconnect();
      setTimeout(() => connect(), 500);
    }
  };
  window.addEventListener('YoursEmitEvent', handler);
  return () => window.removeEventListener('YoursEmitEvent', handler);
}, [connect, disconnect]);
```

After reconnect, `useWallet()` reflects the new `identityKey`, and all your `identityKey`-keyed caches refetch automatically.

## Common pitfalls

{% hint style="danger" %}
Caching balances, profile, or ordinals globally (e.g. in a module-level variable, Redux store keyed only by user-facing label, or localStorage without identity) leaks data between accounts. Always include `identityKey` in cache keys.
{% endhint %}

{% hint style="warning" %}
Persisted caches (e.g. localStorage) are particularly risky. On sign-out, clear or partition by `identityKey`.
{% endhint %}

{% hint style="info" %}
`identityKey` is null when disconnected. Use `!!identityKey` to gate queries.
{% endhint %}

## See also

- [Event Listening](./event-listening.md)
- [Reference: Events](../reference/events.md)
- [Concept: Permissions](../concepts/permissions.md)
