# Summary

* [Introduction](README.md)
* [For AI Agents](ai-onboarding.md)
* [Quickstart](quickstart.md)

## Concepts

* [BRC-100](concepts/brc-100.md)
* [BEEF](concepts/beef.md)
* [Actions & Context](concepts/actions-and-context.md)
* [Baskets & Tags](concepts/baskets-and-tags.md)
* [Derivations](concepts/derivations.md)
* [Permissions](concepts/permissions.md)

## Actions

### Payments

* [sendBsv](actions/send-bsv.md)
* [sendAllBsv](actions/send-all-bsv.md)
* [listOutputs](actions/list-outputs.md)

### Ordinals

* [getOrdinals](actions/get-ordinals.md)
* [transferOrdinals](actions/transfer-ordinals.md)
* [inscribe](actions/inscribe.md)
* [burnOrdinals](actions/burn-ordinals.md)

### Marketplace

* [listOrdinal](actions/list-ordinal.md)
* [purchaseOrdinal](actions/purchase-ordinal.md)
* [cancelListing](actions/cancel-listing.md)
* [deriveCancelAddress](actions/derive-cancel-address.md)

### Collections

* [mintCollection](actions/mint-collection.md)
* [mintCollectionItem](actions/mint-collection-item.md)

### BSV-21 Tokens

* [getBsv21Balances](actions/get-bsv21-balances.md)
* [sendBsv21](actions/send-bsv21.md)
* [listTokens](actions/list-tokens.md)
* [purchaseBsv21](actions/purchase-bsv21.md)
* [deployBsv21Mint](actions/deploy-bsv21-mint.md)
* [deployBsv21Auth](actions/deploy-bsv21-auth.md)
* [mintBsv21](actions/mint-bsv21.md)

### MNEE Stablecoin

* [deriveDepositAddresses](actions/derive-deposit-addresses.md)
* [getMneeBalance](actions/get-mnee-balance.md)
* [sendMnee](actions/send-mnee.md)
* [getMneeHistory](actions/get-mnee-history.md)
* [getMneeTxStatus](actions/get-mnee-tx-status.md)
* [getMneeConfig](actions/get-mnee-config.md)
* [getMneeUtxos](actions/get-mnee-utxos.md)

### Identity (BAP)

* [getProfile](actions/get-profile.md)
* [publishIdentity](actions/publish-identity.md)
* [updateProfile](actions/update-profile.md)
* [rotateIdentity](actions/rotate-identity.md)
* [attest](actions/attest.md)
* [computeBapId / resolveBapId](actions/compute-resolve-bap-id.md)

### Locks (Timelock)

* [getLockData](actions/get-lock-data.md)
* [lockBsv](actions/lock-bsv.md)
* [unlockBsv](actions/unlock-bsv.md)

### Signing & Encryption

* [signBsm](actions/sign-bsm.md)
* [getAuthToken](actions/get-auth-token.md)
* [Encrypt / Decrypt](actions/encrypt-decrypt.md)
* [getFriendPublicKey](actions/get-friend-public-key.md)

### Social

* [createSocialPost](actions/create-social-post.md)

### OpNS Names

* [opnsRegister](actions/opns-register.md)
* [opnsDeregister](actions/opns-deregister.md)
* [getOpnsNames](actions/get-opns-names.md)

### Sync

* [syncAddresses](actions/sync-addresses.md)
* [syncMessages](actions/sync-messages.md)
* [syncCosignDeliveries](actions/sync-cosign-deliveries.md)

### Sweep / Import

* [sweepBsv](actions/sweep-bsv.md)
* [sweepOrdinals](actions/sweep-ordinals.md)
* [sweepBsv21](actions/sweep-bsv21.md)
* [sweepDeposit](actions/sweep-deposit.md)

## Low-Level (BRC-100)

* [Blockchain Queries](low-level/blockchain-queries.md)
* [Key Derivation](low-level/key-derivation.md)
* [Transaction Actions](low-level/transaction-actions.md)
* [Cryptography](low-level/cryptography.md)
* [Certificates](low-level/certificates.md)
* [Discovery](low-level/discovery.md)
* [Key Linkage](low-level/key-linkage.md)
* [Output Management](low-level/output-management.md)
* [Action History](low-level/action-history.md)

## Cookbook

* [Mint & List Ordinal](cookbook/mint-and-list-ordinal.md)
* [Sweep Paper Wallet](cookbook/sweep-paper-wallet.md)
* [MNEE Send Flow](cookbook/mnee-send-flow.md)
* [BAP Identity Setup](cookbook/bap-identity-setup.md)
* [Event Listening](cookbook/event-listening.md)
* [Multi-Account Handling](cookbook/multi-account-handling.md)

## Migration

* [Legacy Provider → @1sat/actions](migration/legacy-provider.md)
* [Version History](migration/version-history.md)

## Reference

* [Errors](reference/errors.md)
* [Types](reference/types.md)
* [Packages](reference/packages.md)
* [Events](reference/events.md)
