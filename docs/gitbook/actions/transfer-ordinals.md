---
description: Transfer one or more ordinals to recipient addresses or identity pubkeys.
icon: arrow-right-arrow-left
---

# transferOrdinals

**Package:** `@1sat/actions`
**Category:** Ordinals

## Signature

```ts
transferOrdinals.execute(ctx: OneSatContext, input: TransferOrdinalsRequest): Promise<OrdinalOperationResponse>
```

## Input

```ts
interface TransferOrdinalsRequest {
  transfers: Array<{
    /** The ordinal output to transfer — from getOrdinals */
    ordinal: WalletOutput;
    /** Recipient identity public key (PREFERRED — derives a per-counterparty address) */
    counterparty?: string;
    /** Raw P2PKH address (alternative to counterparty) */
    address?: string;
    /** Optional MAP metadata to append to the output script */
    map?: Record<string, string>;
    /** Optional extra tags on the output (e.g. 'status:published') */
    extraTags?: string[];
  }>;
  /** BEEF for inputs — resolved automatically via ID tag if omitted */
  inputBEEF?: number[];
}
```

Pass EITHER `counterparty` OR `address` per transfer.

## Output

```ts
interface OrdinalOperationResponse {
  txid?: string;
  tx?: number[];
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- You have called `getOrdinals` first to obtain the ordinal `WalletOutput` (and ideally BEEF)

## Permission prompts

- `createAction`

## Example

Send to a plain BSV address:

```tsx
import { getOrdinals, transferOrdinals } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
const ordinal = outputs.find((o) => o.outpoint === targetOutpoint);
if (!ordinal) throw new Error('Ordinal not found');

const result = await transferOrdinals.execute(ctx, {
  transfers: [{ ordinal, address: '1Recipient...' }],
  inputBEEF: BEEF ? Array.from(BEEF) : undefined,
});
if (result.error) throw new Error(result.error);
```

Send to an identity pubkey (preferred — derives a per-counterparty address):

```tsx
const result = await transferOrdinals.execute(ctx, {
  transfers: [
    {
      ordinal,
      counterparty: '02recipient-identity-key...',
      map: { app: 'my-app', type: 'gift' },
      extraTags: ['status:gifted'],
    },
  ],
  inputBEEF: BEEF ? Array.from(BEEF) : undefined,
});
```

## Common pitfalls

{% hint style="info" %}
Prefer `counterparty` (identity pubkey) over `address` when the recipient is a BRC-100 wallet user. It derives a per-recipient address automatically, which prevents address reuse and is friendlier to overlay routing.
{% endhint %}

{% hint style="warning" %}
You MUST pass the actual `WalletOutput` object — not just an outpoint string. The wallet needs the output's basket, tags, and locking script context.
{% endhint %}

{% hint style="info" %}
`inputBEEF` is technically optional — the SDK can resolve BEEF from the ordinal's `id:` tag in many cases. Pass it explicitly when you have it for reliability.
{% endhint %}

## Errors

| Code                     | Cause                                            |
| ------------------------ | ------------------------------------------------ |
| `user-rejected`          | User denied the wallet prompt                    |
| `no-beef`                | `inputBEEF` missing and not resolvable from tags |
| `not-found`              | Ordinal not in wallet (stale snapshot — refetch) |
| `invalid-address`        | Malformed `address`                              |
| `invalid-counterparty`   | Malformed `counterparty` pubkey hex              |
| `storage-payment-failed` | Wallet remote storage needs top-up               |

## Related

- [getOrdinals](./get-ordinals.md) — required first call
- [inscribe](./inscribe.md)
- [listOrdinal](./list-ordinal.md)
- [Concept: BEEF](../concepts/beef.md)
