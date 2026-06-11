---
description: Unlock all currently-unlockable BSV from prior lockBsv calls.
icon: unlock
---

# unlockBsv

**Package:** `@1sat/actions`
**Category:** Locks

## Signature

```ts
unlockBsv.execute(ctx: OneSatContext, input: {}): Promise<UnlockBsvResult>
```

## Input

```ts
interface UnlockBsvInput {}
```

## Output

```ts
interface UnlockBsvResult {
  txid?: string;
  error?: string;
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`
- At least one locked output whose `until` height has been reached. Check with [getLockData](./get-lock-data.md).

## Permission prompts

- `createAction`

## Example

```tsx
import { getLockData, unlockBsv } from '@1sat/actions';

const { unlockable } = await getLockData.execute(ctx, {});
if (unlockable === 0) {
  console.log('Nothing to unlock');
  return;
}

const result = await unlockBsv.execute(ctx, {});
if (result.error) throw new Error(result.error);
console.log('Unlocked in:', result.txid);
```

## Common pitfalls

{% hint style="info" %}
Unlocks ALL currently-unlockable locks in one transaction. There is no selective unlock — call [getLockData](./get-lock-data.md) first to know what is being unlocked.
{% endhint %}

{% hint style="warning" %}
If `unlockable === 0`, calling `unlockBsv` is wasteful (returns error or no-op).
{% endhint %}

## Errors

| Code                | Cause                                           |
| ------------------- | ----------------------------------------------- |
| `user-rejected`     | User denied the wallet prompt                   |
| `nothing-to-unlock` | No locked output has reached its `until` height |

## Related

- [lockBsv](./lock-bsv.md)
- [getLockData](./get-lock-data.md)
