/**
 * Tests whether a string starts with an RFC 3986 URI scheme
 * (e.g. `https://`, `http://`, `data:`, `ipfs://`, `ar://`).
 *
 * Useful when a value may be either an addressable URI or an on-chain
 * reference (outpoint) that needs gateway resolution.
 */
export const isUri = (s: string): boolean => /^[a-z][a-z0-9+\-.]*:/i.test(s)
