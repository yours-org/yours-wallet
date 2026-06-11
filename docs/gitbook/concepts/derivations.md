---
description: P1SAT deposit-address derivation — the default prefix is '1sat' and is shared across 1Sat wallets.
icon: arrows-split-up-and-left
---

# Derivations

MNEE (the USD stablecoin on BSV) is settled to addresses derived under the **P1SAT protocol** — a deterministic derivation scheme that namespaces addresses by a `keyID` prefix string.

The default prefix is **`1sat`**. It is intentionally shared across all 1Sat wallets — Yours Wallet, wallet-desktop, CLI, MCP servers — so the same identity key derives the same default deposit addresses across every implementation. You only need to set a custom `prefix` if you want a distinct address set for some app-specific purpose.

## The derivation API

```tsx
import { deriveDepositAddresses } from '@1sat/actions';

// Omit prefix to use the default ('1sat'):
const { derivations } = await deriveDepositAddresses.execute(ctx, {
  startIndex: 0,
  count: 5,
});

// Or pass it explicitly:
const { derivations } = await deriveDepositAddresses.execute(ctx, {
  prefix: '1sat',
  startIndex: 0,
  count: 5,
});
```

Returns a `derivations` array of `AddressDerivation` objects — each with an `address` plus the keyID info needed for signing.

## Two views: derivations vs addresses

```tsx
const { derivations } = await deriveDepositAddresses.execute(ctx, {
  startIndex: 0,
  count: 5,
});

// For balance / history calls: just the address strings
const addresses = derivations.map((d) => d.address);

// For sending MNEE: pass the full derivations array — sendMnee needs the keyID info
```

`sendMnee` requires you to pass `derivations` (not just addresses) because it needs to sign with the per-address keys.

## Typical MNEE flow

```tsx
import { deriveDepositAddresses, getMneeBalance, sendMnee } from '@1sat/actions';

// 1. Derive (cache these)
const { derivations } = await deriveDepositAddresses.execute(ctx, {
  startIndex: 0,
  count: 5,
});
const addresses = derivations.map((d) => d.address);

// 2. Check balance (just addresses needed)
const balance = await getMneeBalance.execute(ctx, { addresses });

// 3. Send (derivations are required)
const sent = await sendMnee.execute(ctx, {
  recipients: [{ address: '1Recipient...', amount: Number(userInput) }],
  derivations,
});
```

{% hint style="danger" %}
`sendMnee` requires `amount` to be a **number** in **decimal MNEE** (e.g. `1.5` = $1.50). Always coerce user input with `Number(userInput)`.
{% endhint %}

## Custom prefixes

Use a custom prefix only when you want a distinct address set — for example, an MCP server tracking its own deposits separately:

```tsx
const { derivations } = await deriveDepositAddresses.execute(ctx, {
  prefix: 'mcp',
  startIndex: 0,
  count: 5,
});
```

The custom prefix derives a different address tree. The user's MNEE balance under the default `'1sat'` prefix and a custom `'mcp'` prefix are independent.

## Sync

If the user receives MNEE while the wallet is offline, call `syncAddresses` to bring the wallet's internal index forward:

```tsx
import { syncAddresses } from '@1sat/actions';

await syncAddresses.execute(ctx, { count: 5 }); // default prefix
```

## Related

- [deriveDepositAddresses](../actions/derive-deposit-addresses.md)
- [getMneeBalance](../actions/get-mnee-balance.md)
- [sendMnee](../actions/send-mnee.md)
- [syncAddresses](../actions/sync-addresses.md)
