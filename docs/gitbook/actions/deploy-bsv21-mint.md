---
description: Deploy a BSV-21 token with a fixed total supply in a single transaction.
icon: rocket
---

# deployBsv21Mint

**Package:** `@1sat/actions`
**Category:** BSV-21

Deploys a BSV-21 token where the **entire supply is minted at deploy time** and sent to a destination. After this transaction, no further mints are possible — total supply is locked.

For a mintable-supply token (deploy now, mint later), use [deployBsv21Auth](./deploy-bsv21-auth.md) + [mintBsv21](./mint-bsv21.md).

## Signature

```ts
deployBsv21Mint.execute(ctx: OneSatContext, input: DeployBsv21MintInput): Promise<DeployBsv21Response>
```

## Input

```ts
import type { Destination } from '@1sat/types';

interface DeployBsv21MintInput {
  /** Token symbol / ticker (max 32 chars) */
  symbol: string;
  /** Total fixed supply (bigint or string) in atomic units */
  amount: bigint | string;
  /** Decimal places (0-18). Default 0. */
  decimals?: number;
  /** Optional icon URL or data URI */
  icon?: string;
  /** Where the entire supply is sent. Defaults to self. */
  destination?: Destination;
}
```

## Output

```ts
interface DeployBsv21Response {
  txid?: string;
  tx?: number[];
  /** New token ID: "<txid>_<deployVout>" — pin this for future references */
  tokenId?: string;
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

```tsx
import { deployBsv21Mint } from '@1sat/actions';

const result = await deployBsv21Mint.execute(ctx, {
  symbol: 'MEME',
  amount: 1_000_000n * 10n ** 8n, // 1M tokens with 8 decimals
  decimals: 8,
  icon: 'https://example.com/meme.png',
});
if (result.error) throw new Error(result.error);

console.log('Deployed token:', result.tokenId);
// pin result.tokenId for future sendBsv21 / purchaseBsv21 calls
```

Deploy to a specific recipient (e.g. an airdrop contract address):

```tsx
const result = await deployBsv21Mint.execute(ctx, {
  symbol: 'AIRDROP',
  amount: 10_000n,
  decimals: 0,
  destination: { address: '1AirdropContract...' },
});
```

## Common pitfalls

{% hint style="danger" %}
`amount` is the TOTAL supply in **atomic units**, and it cannot be increased later. For a token with `decimals: 8`, passing `amount: 1_000_000n` is a token with only 0.01 supply.
{% endhint %}

{% hint style="warning" %}
After this transaction succeeds, no further mints are possible. To preserve the ability to mint later, use [deployBsv21Auth](./deploy-bsv21-auth.md) instead.
{% endhint %}

{% hint style="info" %}
The returned `tokenId` uses **underscore** format `txid_vout`. Pin it for `sendBsv21`, `purchaseBsv21`, etc.
{% endhint %}

## Errors

| Code                 | Cause                                             |
| -------------------- | ------------------------------------------------- |
| `user-rejected`      | User denied the wallet prompt                     |
| `insufficient-funds` | Not enough BSV                                    |
| `invalid-symbol`     | Symbol too long (>32 chars) or invalid characters |
| `invalid-amount`     | Supply not a positive integer                     |

## Related

- [deployBsv21Auth](./deploy-bsv21-auth.md) — mintable-supply alternative
- [mintBsv21](./mint-bsv21.md)
- [sendBsv21](./send-bsv21.md)
- [getBsv21Balances](./get-bsv21-balances.md)
