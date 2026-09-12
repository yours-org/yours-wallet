# OrdLock listing create OFF (OPL-4696 / OPL-4694)

New OrdLock listings must not be created in Yours Wallet. A replacement listing
contract is coming. **Buy** of others' listings and **cancel** of your own
listings stay enabled.

## Wallet behavior

- UI "List" entry points and `handleListOrdinal` / `sellOrdinal.execute` fail
  closed with a deprecation toast/error.
- Sites marked `ORDLOCK_LISTING_DISABLED` (grep that string) should be restored
  when the replacement contract ships.
- Manual cancel on OrdWallet still uses `cancelOwnedOrdLockListings` →
  `cancelOrdinalListing`. Import/sweep does not delist first: listed UTXOs stay
  in their class and cancel into the destination in that spend, same as
  `1sat sweep import`.

## Provider

`yours-wallet-provider` create-off for a `listOrdinal` bridge is **N/A** for
this change set (viewer permission is pull-only; no push). Listing create is
disabled in the extension UI and helper path instead.

## Related

- Pattern: https://github.com/b-open-io/1sat-sdk/pull/54
- Linear: OPL-4696 (cancel on load/sweep), OPL-4694 (create OFF)
