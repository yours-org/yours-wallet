# OrdLock listing create OFF (OPL-4696 / OPL-4694)

New OrdLock listings must not be created in Yours Wallet. A replacement listing
contract is coming. **Buy** of others' listings and **cancel** of your own
listings stay enabled.

## Wallet behavior

- UI "List" entry points and `handleListOrdinal` / `sellOrdinal.execute` fail
  closed with a deprecation toast/error.
- Sites marked `ORDLOCK_LISTING_DISABLED` (grep that string) should be restored
  when the replacement contract ships.
- On OrdWallet load/refresh and before BSV sweep / send-all, the wallet
  auto-cancels OrdLock-listed UTXOs it controls (`tags` include `ordlock`) via
  `cancelOwnedOrdLockListings` → `cancelOrdinalListing` (cancel→recover into
  wallet). Runs once per load/sweep session; failures log and do not block the
  wallet.

## Provider

`yours-wallet-provider` create-off for a `listOrdinal` bridge is **N/A** for
this change set (viewer permission is pull-only; no push). Listing create is
disabled in the extension UI and helper path instead.

## Related

- Pattern: https://github.com/b-open-io/1sat-sdk/pull/54
- Linear: OPL-4696 (cancel on load/sweep), OPL-4694 (create OFF)
