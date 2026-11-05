---
description: Read the wallet's 1Color holdings and balances with listOutputs — the `p color assets` and `p color balance` selectors.
icon: coins
---

# 1Color balances

**Package:** `@bsv/sdk` (`WalletInterface.listOutputs`) with `@1sat/templates` to decode
**Category:** 1Color

There is no `getBalances` action for 1Color. The wallet's color module answers two `listOutputs` selectors, and reads report wallet state only: they never query the overlay.

## Balance of one asset

```ts
const { totalOutputs } = await wallet.listOutputs({
  basket: `p color balance ${assetId}`, // or `p color balance ${assetId} authority`
});
const available = BigInt(totalOutputs); // atomic units; authority: the count of authorities
```

`totalOutputs` carries the exact sum of **available** value units as a decimal string (reserved outputs are left out). `outputs` is empty.

## Every holding

```ts
import { ASSETS_SELECTOR } from '@bsv/color-permission-module';
import { OneColor } from '@1sat/templates';
import { LockingScript } from '@bsv/sdk';

const { outputs, totalOutputs } = await wallet.listOutputs({
  basket: ASSETS_SELECTOR, // 'p color assets'
  include: 'locking scripts',
  includeTags: true,
  limit: 1000,
  offset: 0, // page while outputs.length < totalOutputs
});

const byAsset = new Map<string, { available: bigint; reserved: bigint; authorities: number }>();
for (const o of outputs) {
  const token = OneColor.decode(LockingScript.fromHex(o.lockingScript!));
  if (!token?.tokenId || token.role === 'deploy') continue;
  const entry = byAsset.get(token.tokenId) ?? { available: 0n, reserved: 0n, authorities: 0 };
  if (token.role === 'authority') entry.authorities += 1;
  else if (o.tags?.includes('color_state_reserved')) entry.reserved += token.amount;
  else entry.available += token.amount;
  byAsset.set(token.tokenId, entry);
}
```

Each output carries `color_state_available` or `color_state_reserved`. Reserved means "an input of an action that is not proven yet", which covers two different things: an unsent handoff (`nosend`), whose tokens are still the wallet's until the recipient claims it, and a broadcast transaction (`unproven`, `sending`), whose inputs are already spent and whose change is listed as available. Treat `available` as the balance. To show what is held by unsent sends, look each reserved outpoint up in `listActions` (with `includeInputs`) and count only those whose spending action's `status` is `nosend`, `unsigned` or `nonfinal`; adding every reserved output to the balance counts a spent input and its change twice.

## Symbol, decimals and icon

Metadata lives only on the asset's deploy output. Fetch the deploy transaction (the `txid` of the asset id) and decode the output at `vout`:

```ts
import { Transaction } from '@bsv/sdk';

const [txid, vout] = assetId.split('_');
const raw = await services.beef.getRawTx(txid); // or any source of the raw transaction
const tx = Transaction.fromBinary(raw);
const deploy = OneColor.decode(tx.outputs[Number(vout)].lockingScript);
// deploy.role === 'deploy'
const { sym, dec = 0, icon } = deploy.metadata ?? {};
// icon: { mediaType: 'image/png', bytes: Uint8Array } — embed as a data URL
```

Cache this per asset: it never changes.

## Permission prompts

- `color_access` for the basket read. Yours stores an approved basket grant per app, so the user is asked once per basket.

## Common pitfalls

{% hint style="warning" %}
Amounts are **`bigint`** in atomic units. Divide by `10 ** dec` only for display.
{% endhint %}

{% hint style="info" %}
Tokens held by an unsent handoff are still yours. They return to available when the action is aborted or expires, and leave the wallet when the recipient submits it.
{% endhint %}

{% hint style="info" %}
The per-asset baskets (`p color <assetTag>`) can be listed directly too, but prefer the selectors: the `p color assets` view hides the module's bookkeeping tags and pages across every asset.
{% endhint %}

## Related

- [1Color Tokens](../concepts/one-color.md)
- [send1Color](./send-1color.md)
- [Output Management](../low-level/output-management.md)
