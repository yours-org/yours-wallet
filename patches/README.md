# Native wallet dependency corrections

These Bun patches retain the pinned `@1sat/wallet@0.0.121` and
`@bopen-io/wallet-toolbox-client@2.14.8` packages. `bun install --frozen-lockfile`
applies them through `patchedDependencies`; no package versions or registry
integrity values change.

The permissions manager calls the underlying `createAction` before checking
spending authorization. Storage already contains the unsigned action and its
signed net wallet value at that point. Counting that action in monthly history
and adding its new spend again can reject a payment below an approved allowance.
The patch passes the wallet-issued action reference through the local grant
manager, requests action labels, and excludes exactly the matching wallet-owned
BRC-153 reference label from history before adding the current payment once.
Other unsigned, noSend, posted and completed actions retain their existing
accounting, as do signed incoming values and pagination. Missing or ambiguous
current references fail closed and the existing createAction error path aborts
the new action. Direct pre-creation checks and settings history omit no actions.
The approved cap and persisted grant are unchanged.

This requires BRC-153 storage behavior: `listActions({ includeLabels: true })`
returns one synthetic `reference <lowercase hex>` label derived from the stored
Base64 action reference, replacing caller-supplied reserved-prefix labels.
[The pinned BRC-153 specification](https://github.com/bsv-blockchain/BRCs/blob/39a643ff148a8dcd23ec08986a8ddeb7d5713743/wallet/0153.md)
defines that ownership boundary. The patch does not trust ordinary user labels
as action identity and does not exclude every unsigned transaction.

Both toolbox exports (ESM and CommonJS) and their declarations are patched.
Their new `standing-allowance.map` files retain original upstream mappings and
source content outside edited spans, and map edited spans to explicitly marked
patch source content. The original toolbox maps remain as upstream records.
The smaller local-manager maps are replaced equivalently. This accounts for
most patch bytes; the runtime changes are limited to the four corrections described here.

`src/spending-allowance.test.ts` exercises the actual exported managers and
permission store with deterministic wallet/storage fixtures and real BEEF
transactions. It covers fee-inclusive sequential payments, restart, concurrent
requests, other pending reservations, overflow/abort, malformed history,
pagination, signed net values, preflight/settings reads and CommonJS behavior.
`src/spending-allowance.maps.test.ts` validates mapping bounds and new logic.

Retire both patches together when an upstream package release carries equivalent
current-reference accounting. Verify both suites and the production build
before removing the patch bindings; never replace the fix with a larger grant
or an unsigned-action filter. These source changes need a new built-artifact
identity and do not change evidence from an earlier wallet archive.

## Basket permission tags

The same toolbox patch bounds internal basket-permission tags to the SDK's
300-byte UTF-8 limit. The existing `basket <name>` tag is unchanged whenever it
fits. Longer names use the disjoint `basket-sha256 <digest>` prefix with SHA-256
of the full UTF-8 name. Token creation, direct lookup and filtered listing use
the same helper; the authenticated, encrypted token payload still contains the
full basket name and readers compare it exactly. No hash is treated as proof of
permission. `src/basket-permission-boundary.test.ts` covers byte boundaries,
multibyte names, local grant restart and signed on-chain token readers.

## Certificate keyring revealer

Direct certificate acquisition validates the keyring with its declared revealer,
resolving the existing `certifier` sentinel to the issuer. The signature is still
verified against the issuer. Subsequent proof creation uses the stored keyring
verifier, with the historical issuer fallback for legacy records lacking it.
`src/certificate-revealer.test.ts` uses actual Wallet and ProtoWallet cryptography
to acquire, prove and independently decrypt a third-party-rewrapped keyring;
wrong revealers and corrupt signatures reject before insertion.

## Wallet-known input proofs

For a signable action, the signer hydrates caller txid-only inputs from the
storage plan BEEF, retained wallet BEEF or the plan's raw source transaction.
Every planned source is bound to the requested outpoint, transaction ID, output
script and satoshi value. Storage's existing `trustSelf: 'known'` check remains
responsible for accepting a previously stored input; an identifier alone is
insufficient. A construction failure after planning aborts that action's
reservation, and an abort failure is surfaced together with the original error.
The existing final-result `knownTxids` trimming remains unchanged.
`src/known-input-hydration.test.ts` exercises actual createAction/signAction,
all three source paths, script verification, final trimming, unknown/missing or
mismatched evidence, abort cleanup and explicit abort failure.
