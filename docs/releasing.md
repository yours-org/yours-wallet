# Releasing

Releases are built, packaged, and attested by GitHub Actions. Nothing is built or zipped on a developer machine, no signing keys or secrets are involved, and Chrome Web Store submission stays manual.

## Cutting a release

```bash
bun run release 5.0.4
```

The script checks that you are on a clean, up-to-date `main`, runs the formatter and typechecker, bumps the version in `package.json` and `public/manifest.json`, commits `Update version to v5.0.4`, creates the annotated tag `v5.0.4`, and pushes both.

Pushing the tag triggers [`release.yml`](../.github/workflows/release.yml), which:

1. **Builds** from a clean checkout with the pinned toolchain (`.bun-version`, `.nvmrc`) and a frozen lockfile.
2. **Verifies** the output: required files, manifest references, version and tag agreement, and that the popup bundle carries the tagged commit.
3. **Packages** `build/` into `pw-v5.0.4.zip`, plus `SHA256SUMS` and `pw-v5.0.4.zip.sha256`.
4. **Attests** the zip with a signed build provenance statement tied to the workflow run and commit.
5. **Reproduces** the entire build on a second, fresh runner and fails if any file or the zip differs.
6. **Drafts** a GitHub Release with the zip, the checksums, and generated notes.

When the workflow is green:

1. Open the draft release and download `pw-v5.0.4.zip`.
2. Upload that exact file to the Chrome Web Store developer dashboard.
3. Review the notes and publish the draft.

## Testing the pipeline without shipping

Any tag of the form `vX.Y.Z-suffix` runs the same workflow and produces a draft **prerelease**. The `X.Y.Z` part must still match `package.json`. This is how to exercise the pipeline from a branch:

```bash
git tag v5.0.3-test.1
git push origin v5.0.3-test.1
# inspect the workflow run and the draft release, then clean up:
gh release delete v5.0.3-test.1 --yes
git push --delete origin v5.0.3-test.1
git tag -d v5.0.3-test.1
```

Provenance attestations are written to the public Sigstore transparency log and cannot be deleted, so a test run leaves a harmless permanent record.

## Verifying a release

Every release carries three verification assets:

| Asset                  | What it proves                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `pw-vX.Y.Z.zip.sha256` | The zip you downloaded is the one CI produced.                                      |
| `SHA256SUMS`           | Per-file hashes of everything inside the zip, for comparing an installed extension. |
| Provenance attestation | The zip was built by this repository's release workflow from the tagged commit.     |

**Check the download** (`shasum -a 256 -c` on macOS):

```bash
sha256sum -c pw-v5.0.4.zip.sha256
```

**Check the provenance** with the [GitHub CLI](https://cli.github.com/):

```bash
gh attestation verify pw-v5.0.4.zip --repo yours-org/yours-wallet
```

**Rebuild from source and compare.** The build is reproducible: the same commit produces the same bytes. From a fresh clone of the tag, with the Bun and Node versions pinned in `.bun-version` and `.nvmrc`:

```bash
git clone --branch v5.0.4 https://github.com/yours-org/yours-wallet.git
cd yours-wallet
bun install --frozen-lockfile
bun run build
RELEASE_TAG=v5.0.4 bun run package
curl -sLO https://github.com/yours-org/yours-wallet/releases/download/v5.0.4/SHA256SUMS
diff SHA256SUMS release/SHA256SUMS && echo "identical"
```

A matching `SHA256SUMS` means every file is identical, and `release/pw-v5.0.4.zip.sha256` will match the published hash. Build from a clean checkout: a dirty working tree bakes a `-dirty` marker into the popup bundle and the hashes will not match.

**Compare against what Chrome installed.** The Web Store repackages uploads, so the CRX differs from the zip, but the files inside do not. Find the extension under your Chrome profile (`chrome://version` shows the profile path; extensions live in `Extensions/<id>/<version>_0/`) and check the files against `SHA256SUMS`, stripping the `build/` prefix. Chrome adds its own `_metadata/` folder, which is not part of the release.

```bash
cd "<profile>/Extensions/<id>/<version>_0"
sed 's#  build/#  #' /path/to/SHA256SUMS | sha256sum -c
```

## Toolchain pins

CI and the reproducibility guarantee depend on exact tool versions:

- `.bun-version`: Bun, used to install dependencies and run scripts.
- `.nvmrc`: Node, which runs the Vite build.

Bump them deliberately, in their own pull request, and expect the build output to change when you do.

## If a release build fails

The tag exists but no release was drafted. Fix the problem on `main`, then move the tag to the fix and push it again:

```bash
git push --delete origin v5.0.4
git tag -d v5.0.4
git tag -a v5.0.4 -m "Release v5.0.4"
git push origin v5.0.4
```
