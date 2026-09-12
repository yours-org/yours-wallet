# Marketplace listings (OrdLock v2)

New listings use OrdLock v2 via `sellOrdinal` (`@1sat/actions`). Buy and cancel
of v1 (`ordlock`) and v2 (`ordlock2`) listings stay enabled. Token listings
cancel through `cancelTokenListing`; NFT listings through `cancelOrdinalListing`
/ `cancelOpnsListing`.

Import/sweep does not delist first: listed UTXOs stay in their class and cancel
into the destination in that spend, same as `1sat sweep import`.
