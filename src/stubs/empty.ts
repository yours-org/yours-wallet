// Browser stand-in for xdelta3-wasm, which @1sat/actions imports lazily for ordfs/patch
// (vcdiff). The extension never encodes or applies patches, and the package's browser
// entry points at a file it does not ship.
export default {};
