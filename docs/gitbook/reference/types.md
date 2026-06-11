---
description: Type reference — WalletOutput, WalletStatus, BEEF, ordinal tags, common envelopes.
icon: brackets-curly
---

# Types

## WalletOutput

Returned by `wallet.listOutputs`, `getOrdinals`, and similar.

```ts
interface WalletOutput {
  outpoint: string; // "txid.vout"
  satoshis: number;
  spendable: boolean;
  tags?: string[];
  labels?: string[];
  lockingScript?: string; // populated when include: 'locking scripts'
  customInstructions?: string;
}
```

## Ordinal tags

Tags annotate ordinal outputs. Well-known tag patterns:

| Tag                 | Meaning                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `origin` (bare)     | This output IS the origin inscription                             |
| `origin:<outpoint>` | Transfer — the tag's outpoint references the original inscription |
| `type:<mime>`       | Content type, e.g. `type:image/png`                               |
| `name:<string>`     | Friendly name                                                     |

To compute a content URL from a tag:

```tsx
import { ONESAT_MAINNET_CONTENT_URL } from '@1sat/actions';

const originTag = ord.tags?.find((t) => t.startsWith('origin:'));
const originOutpoint = originTag?.slice('origin:'.length) ?? ord.outpoint;
const url = `${ONESAT_MAINNET_CONTENT_URL}/${originOutpoint}`;
```

## WalletStatus

Returned by `useWallet().status`:

```ts
type WalletStatus = 'disconnected' | 'detecting' | 'selecting' | 'connecting' | 'connected';
```

Guard your code with `status === 'connected'` before calling any action.

## Common response envelope

Most write-type actions return:

```ts
interface WriteEnvelope {
  txid?: string;
  error?: string;
  // action-specific extras: ticketId, BEEF, outputs, etc.
}
```

Check `error` first; access `txid` only after.

## OneSatContext

Opaque type returned by `createContext(wallet, { chain, services })`. Most code does not need to inspect its shape — pass it to action `.execute(ctx, input)` calls.

```ts
import { createContext } from '@1sat/actions';
import { OneSatServices } from '@1sat/client';

const services = new OneSatServices('main');
const ctx = createContext(wallet, { chain: 'main', services });
// ctx: OneSatContext
```

## BEEF

Background Evaluation Extended Format — serialized transaction ancestry.

- In responses: `BEEF: Uint8Array | undefined`
- In requests (`inputBEEF`): `number[]` — convert with `Array.from(BEEF)`

```tsx
const { outputs, BEEF } = await getOrdinals.execute(ctx, {});
if (!BEEF) throw new Error('No BEEF');
const inputBEEF: number[] = Array.from(BEEF);
```

See [Concept: BEEF](../concepts/beef.md).

## Content URLs

```ts
import { ONESAT_MAINNET_CONTENT_URL } from '@1sat/actions';

const url = `${ONESAT_MAINNET_CONTENT_URL}/${originOutpoint}`;
```

The constant points at the 1Sat content gateway for mainnet. For test networks, check the SDK exports.

## Utility functions

```ts
import { Utils } from '@bsv/sdk';
const base64 = Utils.toBase64(new TextEncoder().encode('Hello'));

import { MneeClient } from '@1sat/client';
const formatted = MneeClient.fromAtomicAmount(atomicAmount);
```

## Format conventions

| Concept                 | Format                                                | Example                   |
| ----------------------- | ----------------------------------------------------- | ------------------------- |
| Outpoint                | `txid.vout` (dot)                                     | `abc123...def.0`          |
| Token ID (BSV-21)       | `txid_vout` (underscore)                              | `abc123...def_0`          |
| Collection ID           | `txid_vout` (underscore) — same format as token ID    | `abc123...def_0`          |
| BSV address             | P2PKH base58                                          | `1Address...`             |
| Pubkey                  | Hex compressed, 33 bytes / 66 chars, `02`/`03` prefix | `02abc...`                |
| BAP ID                  | Schema.org-compatible identifier                      | (opaque string)           |
| Image URI in profile    | `1sat://txid.vout`                                    | `1sat://abc...def.0`      |
| Satoshis                | Integer                                               | `100000` (= 0.001 BSV)    |
| MNEE amount             | `number` (decimal MNEE)                               | `1.5` (= $1.50)           |
| BSV-21 amount           | `bigint \| string`, atomic units                      | `1500000n` or `'1500000'` |
| BSV-21 recipient        | `Destination` object (typically `{ address: '...' }`) | —                         |
| Bsv21Balance.all/listed | `bigint` confirmed/pending                            | `100n`                    |

## See also

- [Concept: Baskets & Tags](../concepts/baskets-and-tags.md)
- [Output Management (low-level)](../low-level/output-management.md)
- [Packages](./packages.md)
- [Errors](./errors.md)
