---
description: Spend a BSV-21 auth UTXO to mint new supply, transfer mint authority, or permanently end minting.
icon: hammer
---

# mintBsv21

**Package:** `@1sat/actions`
**Category:** BSV-21

Spends the current auth UTXO of a mintable BSV-21 token (one previously deployed via [deployBsv21Auth](./deploy-bsv21-auth.md)) to do any combination of:

* Mint new supply (`mint`)
* Continue minting authority — to self by default, or transfer it (`auth`)
* Permanently end minting (`endMinting: true`) — no continuing auth output

## Signature

```ts
mintBsv21.execute(ctx: OneSatContext, input: MintBsv21Input): Promise<MintBsv21Response>
```

## Input

```ts
import type { Destination } from '@1sat/types';

interface MintBsv21Input {
  /** Token ID — "txid_vout" of the deploy+auth */
  tokenId: string;
  /** Optional mint output. Omit to skip minting (auth-only operation). */
  mint?: {
    amount: bigint | string;
    destination: Destination;
  };
  /**
   * Optional continuing / transferred auth. Omit to emit a continuing auth back
   * to self (default). Pass an explicit destination to transfer mint authority.
   */
  auth?: {
    destination: Destination;
  };
  /**
   * Permanently end minting — no continuing auth output is emitted. Must be
   * explicit since this is destructive (the token can never mint again).
   */
  endMinting?: boolean;
}
```

## Output

```ts
interface MintBsv21Response {
  txid?: string;
  tx?: number[];
  /** Outpoint of the new auth UTXO, if one was emitted */
  authOutpoint?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- The wallet currently holds the auth UTXO for `tokenId`
- Sufficient BSV for transaction fee

## Permission prompts

- `createAction`

## Examples

### Mint supply to self, keep auth

```tsx
import { mintBsv21 } from '@1sat/actions';

const result = await mintBsv21.execute(ctx, {
  tokenId: 'abc123...def_0',
  mint: {
    amount: 100_000n,
    destination: { address: '1MyAddress...' },
  },
});
if (result.error) throw new Error(result.error);

console.log('New auth at:', result.authOutpoint);
// pin this outpoint for the next mint
```

### Mint and transfer authority to another holder

```tsx
const result = await mintBsv21.execute(ctx, {
  tokenId: 'abc123...def_0',
  mint: {
    amount: 100_000n,
    destination: { address: '1Recipient...' },
  },
  auth: {
    destination: { address: '1NewAuthHolder...' },
  },
});
```

### Transfer authority without minting

```tsx
const result = await mintBsv21.execute(ctx, {
  tokenId: 'abc123...def_0',
  auth: { destination: { address: '1NewAuthHolder...' } },
});
```

### End minting permanently (no continuing auth)

```tsx
const result = await mintBsv21.execute(ctx, {
  tokenId: 'abc123...def_0',
  mint: {
    amount: 50_000n,           // final mint
    destination: { address: '1Final...' },
  },
  endMinting: true,            // no continuing auth — irreversible
});
// result.authOutpoint will be undefined
```

## Common pitfalls

{% hint style="danger" %}
`endMinting: true` is **irreversible**. After this call succeeds, no further `mintBsv21` calls are possible for this token — supply is permanently locked at the current amount.
{% endhint %}

{% hint style="warning" %}
After a successful mint, the OLD `authOutpoint` is spent. Always pin the new `authOutpoint` from the response for the next mint.
{% endhint %}

{% hint style="warning" %}
`mint.amount` is in **atomic units** (`bigint | string`). Multiply by `10 ** decimals` if working with decimal token amounts.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `not-found` | Token's auth UTXO not in wallet (already spent / not received) |
| `invalid-amount` | Bad `mint.amount` |
| `insufficient-funds` | Not enough BSV for tx fee |

## Related

- [deployBsv21Auth](./deploy-bsv21-auth.md) — produces the initial auth UTXO
- [deployBsv21Mint](./deploy-bsv21-mint.md) — fixed-supply alternative
- [sendBsv21](./send-bsv21.md)
- [getBsv21Balances](./get-bsv21-balances.md)
