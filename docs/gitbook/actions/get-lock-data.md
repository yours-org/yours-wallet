---
description: Read the wallet's timelock summary — total locked, currently unlockable, next unlock height.
icon: lock-open
---

# getLockData

**Package:** `@1sat/actions`
**Category:** Locks

## Signature

```ts
getLockData.execute(ctx: OneSatContext, input: {}): Promise<GetLockDataResult>
```

## Input

```ts
interface GetLockDataInput {}
```

## Output

```ts
interface GetLockDataResult {
  totalLocked: number; // satoshis currently locked
  unlockable: number; // satoshis that can be unlocked right now
  nextUnlock?: number; // block height of the next upcoming unlock
}
```

## Preconditions

- Connected wallet
- `ctx` from `createContext(wallet, { chain: 'main', services })`

## Permission prompts

- None (read-only)

## Example

```tsx
import { getLockData } from '@1sat/actions';

const { totalLocked, unlockable, nextUnlock } = await getLockData.execute(ctx, {});
console.log(`Locked: ${totalLocked} sats`);
console.log(`Unlockable now: ${unlockable} sats`);
if (nextUnlock) console.log(`Next unlock at block ${nextUnlock}`);
```

## Use cases

- Wallet UI showing lock status
- Pre-flight before calling [unlockBsv](./unlock-bsv.md) — only call when `unlockable > 0`
- Surfacing time-to-unlock estimates

## Related

- [lockBsv](./lock-bsv.md)
- [unlockBsv](./unlock-bsv.md)
