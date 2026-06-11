---
description: Background Evaluation Extended Format — required for operations that spend ordinal outputs.
icon: layer-group
---

# BEEF

**BEEF** stands for **Background Evaluation Extended Format**. It is a binary serialization of a transaction together with its ancestry — enough data for a verifier to confirm the inputs are valid SPV-style.

In Yours Wallet, BEEF appears whenever you need to spend an existing on-chain output: transfer an ordinal, list it for sale, cancel a listing, register an OpNS name, etc.

## The fetch-first pattern

For any action that consumes an ordinal output, you MUST first call `getOrdinals` to get both the output object and its BEEF:

```tsx
import { getOrdinals, transferOrdinals } from '@1sat/actions';

// Step 1: fetch ordinals + BEEF
const { outputs, BEEF } = await getOrdinals.execute(ctx, {});

// Step 2: guard
if (!BEEF) throw new Error('No BEEF returned');

// Step 3: find the ordinal you want
const ordinal = outputs.find(o => o.outpoint === targetOutpoint);
if (!ordinal) throw new Error('Ordinal not found');

// Step 4: pass both to the spending action
const result = await transferOrdinals.execute(ctx, {
  transfers: [{ ordinal, address: '1Recipient...' }],
  inputBEEF: Array.from(BEEF),
});
```

## Why two steps

The wallet needs the spending action's `inputBEEF` to prove to its peers (and to the BSV overlay network) that the inputs being consumed exist and are unspent. Rather than fetch ancestry on every action call, the SDK exposes it as part of `getOrdinals` so you can:

1. Show the user a list of ordinals (using `outputs`).
2. Let them pick one to act on.
3. Pass that one to a spending action along with the BEEF.

## BEEF may be undefined

{% hint style="warning" %}
`BEEF` may be `undefined` if the wallet currently has no ordinals or no BEEF cache. ALWAYS check before using:

```ts
if (!BEEF) throw new Error('No BEEF available');
```
{% endhint %}

## The `inputBEEF` parameter

Actions that need BEEF accept `inputBEEF: number[]` (a serialized byte array). Convert with `Array.from(BEEF)`:

```ts
inputBEEF: Array.from(BEEF)
```

`BEEF` is a `Uint8Array`; `inputBEEF` is `number[]` for JSON-serializable transport.

## Which actions need BEEF

| Action | Needs BEEF? |
|--------|-------------|
| `transferOrdinals` | yes (required) |
| `listOrdinal` | yes (required) |
| `cancelListing` | yes (required) |
| `opnsRegister` | yes (optional but recommended) |
| `opnsDeregister` | yes (optional but recommended) |
| `buildBurnOrdinals` | yes (required) |
| `sendBsv` | no — wallet manages BSV BEEF internally |
| `sendBsv21` | no |
| `sendMnee` | no |
| `inscribe` | no — creates a new output rather than spending one |

## Related

* [getOrdinals](../actions/get-ordinals.md) — the entry point that returns BEEF
* [transferOrdinals](../actions/transfer-ordinals.md), [listOrdinal](../actions/list-ordinal.md), [cancelListing](../actions/cancel-listing.md) — consumers
* [Transaction Actions](../low-level/transaction-actions.md) — the underlying BRC-100 `createAction` / `internalizeAction` methods that operate on BEEF
* BRC standard: [BRC-95](https://github.com/bitcoin-sv/BRCs/blob/master/transactions/0095.md) — BEEF specification
