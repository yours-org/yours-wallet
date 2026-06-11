---
description: Deploy a BSV-21 token with mintable supply — emits a deploy+auth UTXO that the auth holder can spend to mint.
icon: shield-plus
---

# deployBsv21Auth

**Package:** `@1sat/actions`
**Category:** BSV-21

Deploys a BSV-21 token with **mintable supply**. Initial supply is zero. The transaction emits a single `deploy+auth` output that doubles as the genesis auth UTXO. The auth holder spends it via [mintBsv21](./mint-bsv21.md) to create supply.

For a fixed-supply token (entire supply minted at deploy time), use [deployBsv21Mint](./deploy-bsv21-mint.md).

## Signature

```ts
deployBsv21Auth.execute(ctx: OneSatContext, input: DeployBsv21AuthInput): Promise<DeployBsv21AuthResponse>
```

## Input

```ts
import type { Destination } from '@1sat/types';

interface DeployBsv21AuthInput {
  /** Token symbol / ticker (max 32 chars) */
  symbol: string;
  /** Decimal places (0-18). Default 0. */
  decimals?: number;
  /** Optional icon URL or data URI */
  icon?: string;
  /** Auth-holder for the deploy+auth UTXO (= the first auth). Defaults to self. */
  destination?: Destination;
}
```

## Output

```ts
interface DeployBsv21AuthResponse {
  txid?: string;
  tx?: number[];
  /** New token ID: "<txid>_<deployVout>" */
  tokenId?: string;
  /** Outpoint of the deploy+auth UTXO — needed for future mints */
  authOutpoint?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Sufficient BSV for inscription cost

## Permission prompts

- `createAction`

## Example

Deploy a mintable token, keep auth for yourself:

```tsx
import { deployBsv21Auth } from '@1sat/actions';

const result = await deployBsv21Auth.execute(ctx, {
  symbol: 'GAME',
  decimals: 8,
  icon: 'https://example.com/game-token.png',
});
if (result.error) throw new Error(result.error);

console.log('Token ID:', result.tokenId);
console.log('Auth outpoint:', result.authOutpoint);
// Persist both for future mints
```

Deploy and transfer auth to a different signer (e.g. a multi-sig or DAO):

```tsx
const result = await deployBsv21Auth.execute(ctx, {
  symbol: 'DAO',
  decimals: 6,
  destination: { address: '1MultisigAuth...' },
});
```

## Common pitfalls

{% hint style="warning" %}
Pin BOTH `tokenId` AND `authOutpoint`. `mintBsv21` needs `tokenId`, but the auth UTXO at `authOutpoint` is what authorizes the mint. Losing track of the auth output is losing the ability to mint.
{% endhint %}

{% hint style="info" %}
Initial supply is zero. To mint supply, call [mintBsv21](./mint-bsv21.md) with the resulting `tokenId`.
{% endhint %}

{% hint style="info" %}
The auth output is non-transferable through normal `sendBsv21` — it must be spent via [mintBsv21](./mint-bsv21.md) (optionally with `auth: { destination }` to transfer authority to a new holder).
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `insufficient-funds` | Not enough BSV |
| `invalid-symbol` | Symbol too long or invalid |

## Related

- [mintBsv21](./mint-bsv21.md) — required next step to actually mint supply
- [deployBsv21Mint](./deploy-bsv21-mint.md) — fixed-supply alternative
- [sendBsv21](./send-bsv21.md)
- [getBsv21Balances](./get-bsv21-balances.md)
