---
description: Publish a BAP identity profile with an inscribed avatar.
icon: id-card
---

# BAP Identity Setup

**Goal:** Publish a BAP identity with name, description, and an inscribed avatar image.

## Prerequisites

- Connected wallet
- `ctx` from `createContext`
- Avatar image as base64 (or use an existing ordinal)
- Small BSV reserve for inscription fees

## Steps

### 1. Check current identity state

```tsx
import { getProfile } from '@1sat/actions';

const current = await getProfile.execute(ctx, {});
console.log('Existing profile:', current.profile);
```

If `current.bapId` is present, the user has already published — you can skip directly to `updateProfile`.

### 2. (Optional) Inscribe the avatar

If the avatar is not already an ordinal, inscribe it first to get a `1sat://txid.vout` URI:

```tsx
import { inscribe } from '@1sat/actions';
import { Utils } from '@bsv/sdk';

const avatarBase64 = Utils.toBase64(new Uint8Array(avatarBytes));

const mintResult = await inscribe.execute(ctx, {
  base64Content: avatarBase64,
  contentType: 'image/png',
});
if (mintResult.error) throw new Error(mintResult.error);

const avatarUri = `1sat://${mintResult.txid}.0`;
```

Alternatively, use an existing ordinal the user already owns — fetch via `getOrdinals`, let them pick, and build the URI from its outpoint.

### 3. Publish or update the profile

```tsx
import { updateProfile } from '@1sat/actions';

const result = await updateProfile.execute(ctx, {
  profile: {
    '@type': 'Person',
    name: 'Alice',
    description: 'BSV builder.',
    image: avatarUri,
  },
});
if (result.error) throw new Error(result.error);
console.log('Identity published / updated in:', result.txid);
```

{% hint style="info" %}
`updateProfile` auto-publishes if the identity has not been published yet — you do not need to call `publishIdentity` first.
{% endhint %}

### 4. Verify

```tsx
const final = await getProfile.execute(ctx, {});
console.log('Final BAP ID:', final.bapId);
console.log('Final profile:', final.profile);
```

## Common pitfalls

{% hint style="warning" %}
`profile` may be merge-or-replace semantically (unconfirmed in current docs). Until confirmed, always pass the FULL profile object you want on-chain.
{% endhint %}

{% hint style="info" %}
`image` can be any URL, but `1sat://txid.vout` URIs are preferred since they are immutable and self-hosted on the blockchain.
{% endhint %}

## See also

- [getProfile](../actions/get-profile.md)
- [updateProfile](../actions/update-profile.md)
- [publishIdentity](../actions/publish-identity.md)
- [inscribe](../actions/inscribe.md)
- [rotateIdentity](../actions/rotate-identity.md)
