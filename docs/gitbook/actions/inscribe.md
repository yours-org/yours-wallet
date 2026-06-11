---
description: Create a new 1Sat Ordinal inscription with arbitrary content. Optionally sign with BAP.
icon: pen-to-square
---

# inscribe

**Package:** `@1sat/actions`
**Category:** Ordinals

## Signature

```ts
inscribe.execute(ctx: OneSatContext, input: InscribeRequest): Promise<InscribeResponse>
```

## Input

```ts
import type { Destination } from '@1sat/types';

interface InscribeRequest {
  /** Content, base64-encoded */
  base64Content: string;
  /** MIME type, e.g. 'image/png' */
  contentType: string;
  /** Optional MAP metadata */
  map?: Record<string, string>;
  /** Sign with BAP identity (Sigma protocol) */
  signWithBAP?: boolean;
  /** Where to lock the inscription. Defaults to self. */
  destination?: Destination;
}
```

## Output

```ts
interface InscribeResponse {
  txid?: string;
  tx?: number[];
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- Sufficient BSV in `default` basket
- Content already base64-encoded

## Permission prompts

- `createAction`

## Example

Inscribe a text note (locked to self by default):

```tsx
import { inscribe } from '@1sat/actions';
import { Utils } from '@bsv/sdk';

const base64Content = Utils.toBase64(new TextEncoder().encode('Hello, world!'));

const result = await inscribe.execute(ctx, {
  base64Content,
  contentType: 'text/plain',
});
if (result.error) throw new Error(result.error);
```

Inscribe an image with MAP metadata, signed with BAP, sent to a specific recipient:

```tsx
const result = await inscribe.execute(ctx, {
  base64Content: pngBase64,
  contentType: 'image/png',
  map: { app: 'my-app', type: 'art', title: 'Genesis' },
  signWithBAP: true,
  destination: { address: '1Recipient...' },
});
```

## Common pitfalls

{% hint style="warning" %}
`base64Content` must be base64-encoded. For binary data use `Utils.toBase64` from `@bsv/sdk`. For text, `btoa(...)` does not handle non-ASCII — use `Utils.toBase64(new TextEncoder().encode(text))` instead.
{% endhint %}

{% hint style="info" %}
`signWithBAP` requires the wallet to have a published BAP identity. If not, the wallet may auto-publish first (depending on settings). See [publishIdentity](./publish-identity.md).
{% endhint %}

{% hint style="info" %}
Omit `destination` to lock the inscription to the wallet's own ordinal basket (typical for self-inscription). Pass an explicit destination to inscribe-and-send in one transaction.
{% endhint %}

## Errors

| Code | Cause |
| ---- | ----- |
| `user-rejected` | User denied the wallet prompt |
| `insufficient-funds` | Not enough BSV |
| `invalid-content` | Bad base64 |
| `invalid-destination` | Malformed `destination` |
| `storage-payment-failed` | Wallet remote storage needs top-up |

## Related

- [transferOrdinals](./transfer-ordinals.md)
- [mintCollectionItem](./mint-collection-item.md)
- [burnOrdinals](./burn-ordinals.md)
- [Cookbook: Mint & List Ordinal](../cookbook/mint-and-list-ordinal.md)
