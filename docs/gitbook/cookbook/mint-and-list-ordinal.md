---
description: Full end-to-end flow — inscribe a new ordinal, then list it on the marketplace.
icon: tags
---

# Mint & List Ordinal

**Goal:** Mint a new inscription and list it for sale.

## Prerequisites

- Connected wallet with sufficient BSV
- `ctx` from `createContext`
- Base64-encoded content ready

## Steps

### 1. Inscribe the content

```tsx
import { inscribe } from '@1sat/actions';
import { Utils } from '@bsv/sdk';

const base64Content = Utils.toBase64(new TextEncoder().encode('Hello, world!'));

const mintResult = await inscribe.execute(ctx, {
  base64Content,
  contentType: 'text/plain',
  map: { app: 'my-app', type: 'art' },
});
if (mintResult.error) throw new Error(mintResult.error);
const mintTxid = mintResult.txid!;
console.log('Inscribed in:', mintTxid);
```

### 2. Wait for the wallet to settle

The wallet tracks inscriptions in its ordinals basket. Give it a moment so subsequent `getOrdinals` reflects the new mint:

```tsx
await new Promise((r) => setTimeout(r, 2000));
```

{% hint style="info" %}
Production code should poll `getOrdinals` until the new ordinal appears rather than using a fixed sleep. Some wallets surface new mints near-instantly; others take seconds.
{% endhint %}

### 3. Fetch ordinals + BEEF

```tsx
import { getOrdinals } from '@1sat/actions';

const { outputs, BEEF } = await getOrdinals.execute(ctx, { limit: 100 });
if (!BEEF) throw new Error('No BEEF returned');
```

### 4. Find the newly-minted ordinal

The new ordinal's outpoint is `${mintTxid}.0` (output index 0 by convention):

```tsx
const newOutpoint = `${mintTxid}.0`;
const ordinal = outputs.find((o) => o.outpoint === newOutpoint);
if (!ordinal) throw new Error('Mint not yet tracked — retry getOrdinals');
```

### 5. List it for sale

```tsx
import { listOrdinal } from '@1sat/actions';

const listResult = await listOrdinal.execute(ctx, {
  ordinal,
  inputBEEF: Array.from(BEEF),
  price: 100000, // 0.001 BSV
  payAddress: '1YourPayoutAddr...',
});
if (listResult.error) throw new Error(listResult.error);
console.log('Listed in:', listResult.txid);
```

## Common pitfalls

{% hint style="warning" %}
Calling `getOrdinals` immediately after `inscribe` may not show the new ordinal yet. Poll, do not assume.
{% endhint %}

{% hint style="warning" %}
`price` is in satoshis, not BSV. `payAddress` is where the buyer's payment lands when purchased — typically one of your own addresses.
{% endhint %}

{% hint style="info" %}
If you want to mint into an existing collection rather than a standalone inscription, use [mintCollectionItem](../actions/mint-collection-item.md) instead of `inscribe`.
{% endhint %}

## See also

- [inscribe](../actions/inscribe.md)
- [getOrdinals](../actions/get-ordinals.md)
- [listOrdinal](../actions/list-ordinal.md)
- [cancelListing](../actions/cancel-listing.md)
- [Concept: BEEF](../concepts/beef.md)
