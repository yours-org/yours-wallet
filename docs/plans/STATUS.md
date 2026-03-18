# Project Plans

| Plan | Status | Description |
|------|--------|-------------|
| [Wallet Connect Flow](./2026-03-03-wallet-connect-flow.md) | **COMPLETE** | All auth and popup issues fixed |
| [CWI Intermittent Hang](./2026-03-04-cwi-intermittent-hang.md) | **In Progress** | CWI calls hang after page reload without extension reload |

## Completed Plans

| Plan | Status | Description |
|------|--------|-------------|
| Wallet Connect Flow | **COMPLETE** | Auth flow, popup behavior, session sharing all working |

## Status Legend

- **Not Started**: Plan created, work not begun
- **In Progress**: Active development
- **BLOCKED**: Waiting on dependency or issue resolution
- **Complete**: Work finished and verified

## Notes

### Current State
- Extension has diagnostic logging in `processCWIGetPublicKey`, `processCWIVerifyHmac`, `processCWICreateSignature`, `processCWIVerifySignature`
- Changes in `src/background.ts` are built but **not yet committed** to git
- Branch: `brc100-remote`

### Background.ts Audit (from CWI hang investigation)
Issues identified but not yet fixed:
1. Fire-and-forget async handlers in main switch (not returned)
2. No response on unknown action (default: break)
3. Redundant ensureWallet() inside processCWI* handlers
4. noAuthRequired default path returns undefined
5. Sync try/catch wrapping async .then() in popup handlers
6. Permission response optional chaining silently no-ops if accountContext null
