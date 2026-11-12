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
most patch bytes; the runtime changes are limited to the corrections described here.

`src/spending-allowance.test.ts` exercises the actual exported managers and
permission store with deterministic wallet/storage fixtures and real BEEF
transactions. It covers fee-inclusive sequential payments, restart, concurrent
requests, other pending reservations, overflow/abort, malformed history,
pagination, signed net values, preflight/settings reads and CommonJS behavior.
`src/spending-allowance.maps.test.ts` validates mapping bounds and new logic.

Retire both patches together when an upstream package release carries equivalent
accounting, permission boundaries and public transaction behavior. Verify both suites and the production build
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

## Public transaction options

The permissions manager accepts a non-admin caller's explicit
`signAndProcess: true` by staging internally, applying the same spending and
fee authorization, and finalizing only after approval. The original validated
request still decides whether an unfinished input or explicit `false` requires
a later `signAction`. The trusted admin direct path remains unchanged.

For `returnTXIDOnly`, both automatic and explicit finalization request full
transaction bytes internally and verify them against the authorized template.
Only then does the public response omit `tx`. Deferred actions remember the
create-time setting; an omitted sign-time setting inherits it and an explicit
boolean overrides it. The tracking ends with action ownership, including abort.
BRC-177 protected actions retain their prohibition on omitting required proof
bytes. Invalid raw option values are validated before the internal override.
Failed signing retains the existing automatic abort and fail-closed behavior;
this patch does not invent a repeated-abort success guarantee.

`src/transaction-options.test.ts` runs the actual exported managers, permission
store, SDK validation and real BEEF decoding against an explicit wallet/storage
fixture. It covers defaults, admin and non-admin requests, fee-inclusive denial,
staging, inherited and overridden settings, hostile final transactions, missing
bytes, cross-origin access, cleanup and safe source reuse, failed cleanup,
protected actions, CommonJS, and source maps. The existing patch maps also carry
separate `transaction-options-patch/` source spans for this correction.

## Primary operation errors and cleanup

A failed automatic or explicit finalization still blocks the reference and
attempts abort. If abort also fails or does not confirm success, the original
operation error retains its SDK identity and recovery payload. A separate
`cleanupFailure` receipt reports that the abort remains unconfirmed; the
reference stays blocked and is never represented as safely reusable. The CWI
codec carries only that receipt's declared public fields, alongside the original
error, through Chrome JSON serialization. Tests cover both create/sign paths,
throwing and inconclusive cleanup, frozen primary errors, real event/content
round trips and the production minifier.

## Discovery permission intent and normalized baskets

Identity and attribute discovery apply BRC-100's `BooleanDefaultFalse` to the
protocol permission check. Omission and explicit `false` can use a prior valid
grant and cannot open a new permission request. Explicit `true` permits seeking
consent. Both ESM and CommonJS exports are tested through public CWI and the
actual permissions managers.

Internalization and output relinquishment now forward the validated normalized
basket to storage, matching creation and listing. The patch copies only the
normalized basket field, preserving other request metadata and caller objects.
Real Wallet tests prove an uppercase/space-padded insertion can be listed and
relinquished by its canonical basket through CWI.

The public CWI argument gate also enforces the pinned
[BRC-100 basket namespace rules](https://github.com/bsv-blockchain/BRCs/blob/39a643ff148a8dcd23ec08986a8ddeb7d5713743/wallet/0100.md):
at least five normalized characters, ASCII letters/numbers/spaces, no consecutive
spaces and no redundant ` basket` suffix. Ordinary names retain SDK trim/lowercase
normalization. Noncanonical aliases of `default`, `admin...` and `p ...` are
rejected before permission routing; exact reserved names remain subject to their
existing manager/module ownership. This prevents a raw alias from receiving an
ordinary grant before storage normalizes it into a reserved namespace.

## Linkage scope and concurrent allowance progress

Specific linkage authorization includes the revealed counterparty together
with the protocol and applicable level-2 key. The existing grant key separately
binds the verifier and privileged state. A legacy grant that omitted the peer
does not authorize a new scoped request. The underlying BRC-69 derivation,
encryption context, proofs and returned fields remain unchanged; tests decrypt
the actual result independently.

Protocol permission indexes use the same bounded full-name digest mechanism
as long basket indexes. Lookup, mint and renewal paths retain short valid tags;
long tags use SHA-256, while authenticated token fields must still match the
complete protocol name and counterparty. The prompt retains the full scope.

Action creation uses a per-manager, per-origin FIFO queue from staging through
authorization and finalization. One affordable action can complete before the
next request counts its debit; other pending, held and signed actions remain in
the allowance calculation. Failures release the queue, and admin-originator
operations retain their existing path. This queue is internal to the manager
and adds no public API or persistent state. Tests cover competing over-cap
requests, two requests totaling the exact fee-inclusive cap, failed requests,
existing reservations and source-map preservation. The new compiled spans are
recorded in `native-linkage-discovery-patch/` and `origin-action-queue-patch/`.

Retire these corrections when the pinned upstream manager provides equivalent
peer-scoped grants, discovery defaults, bounded protocol indexes and serialized
allowance decisions, with the same exported-manager regressions passing.
