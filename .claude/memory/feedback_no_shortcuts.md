---
name: No shortcuts on security changes
description: Don't take easy/hacky approaches — think through the proper architecture before implementing
type: feedback
---

When making security-related changes, don't take shortcuts like exposing private fields or adding type hacks to avoid refactoring callers. Think through the proper architecture first. If a change requires updating multiple callers, do the full refactor rather than cutting corners.

**Why:** User called out multiple instances of taking the easy path (keeping passKey on CurrentAccountObject type, making private fields public) instead of properly decoupling the code. Shortcuts in security code are especially unacceptable.

**How to apply:** Before implementing, pause and ask: "Is this the right way to do this, or am I just avoiding work?" If the latter, do the work.
