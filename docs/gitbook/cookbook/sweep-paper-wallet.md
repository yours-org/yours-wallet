---
description: Import BSV, ordinals, and BSV-21 tokens from a WIF private key.
icon: arrow-down-to-bracket
---

# Sweep Paper Wallet

**Goal:** Take a WIF private key, scan its addresses for UTXOs of all kinds, and sweep them into the user's connected wallet.

## Prerequisites

- Connected wallet
- `ctx` from `createContext`
- WIF private key provided by the user
- A UTXO scanning service (out of scope for this SDK)

## Steps

### 1. Parse the WIF

```tsx
import { PrivateKey } from '@bsv/sdk';

const key = PrivateKey.fromWif(wifString);
const address = key.toAddress();
```

### 2. Scan UTXOs at the address

```tsx
// Caller's responsibility — use whichever indexer is appropriate.
// Example shape; the SDK does not provide this directly.
async function scanUtxos(addr: string): Promise<ScannedUtxo[]> {
  // hit your indexer of choice (1sat-stack, WhatsOnChain, etc.)
  const res = await fetch(`https://your-indexer/address/${addr}/utxos`);
  return res.json();
}

const allUtxos = await scanUtxos(address);
```

### 3. Categorize UTXOs

Split the scanned UTXOs by type (BSV / ordinal / BSV-21). The exact split logic depends on your indexer's response — for 1sat-stack-style indexers, ordinals carry an `origin` field and BSV-21s carry a `tokenId`.

```tsx
const bsvUtxos = allUtxos.filter((u) => !u.origin && !u.tokenId);
const ordUtxos = allUtxos.filter((u) => !!u.origin);
const bsv21Utxos = allUtxos.filter((u) => !!u.tokenId);
```

### 4. Prepare inputs and sweep each category

```tsx
import { prepareSweepInputs, sweepBsv, sweepOrdinals, sweepBsv21 } from '@1sat/actions';

const results: { type: string; txid: string }[] = [];

if (bsvUtxos.length) {
  const inputs = await prepareSweepInputs(ctx, bsvUtxos);
  const r = await sweepBsv.execute(ctx, { inputs, keys: [key] });
  if (r.error) throw new Error(`BSV sweep: ${r.error}`);
  results.push({ type: 'bsv', txid: r.txid! });
}

if (ordUtxos.length) {
  const inputs = await prepareSweepInputs(ctx, ordUtxos);
  const r = await sweepOrdinals.execute(ctx, { inputs, keys: [key] });
  if (r.error) throw new Error(`Ordinal sweep: ${r.error}`);
  results.push({ type: 'ord', txid: r.txid! });
}

if (bsv21Utxos.length) {
  const inputs = await prepareSweepInputs(ctx, bsv21Utxos);
  const r = await sweepBsv21.execute(ctx, { inputs, keys: [key] });
  if (r.error) throw new Error(`BSV-21 sweep: ${r.error}`);
  results.push({ type: 'bsv21', txid: r.txid! });
}

console.log('Swept:', results);
```

## Common pitfalls

{% hint style="danger" %}
The WIF key gives full access to the source address. Hold it in memory only as long as needed, do not log it, and clear references after sweep completes.
{% endhint %}

{% hint style="warning" %}
Do NOT mix categories in a single sweep — calling `sweepBsv` with ordinal UTXOs produces a malformed transaction. Categorize first.
{% endhint %}

{% hint style="info" %}
The user will see one wallet prompt per sweep category. If nothing in a category, skip that sweep.
{% endhint %}

## See also

- [sweepBsv](../actions/sweep-bsv.md)
- [sweepOrdinals](../actions/sweep-ordinals.md)
- [sweepBsv21](../actions/sweep-bsv21.md)
