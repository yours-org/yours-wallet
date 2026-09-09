/**
 * Verifies that build/ contains a complete, consistent extension.
 *
 *   - required files exist and every file the manifest references is present
 *   - manifest.json version matches package.json
 *   - RELEASE_TAG, if set, matches the package version (a prerelease suffix is allowed)
 *   - the popup bundle carries the commit it was built from (fails in release mode)
 *
 * Usage:
 *   bun run verify:build                       # local, and CI on pull requests
 *   RELEASE_TAG=v5.0.4 bun run verify:build    # release workflow
 */
import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const build = resolve(root, 'build');

const REQUIRED_FILES = ['manifest.json', 'index.html', 'sweep-tab.html', 'background.js', 'content.js', 'inject.js'];

const errors: string[] = [];
const notes: string[] = [];
const fail = (message: string) => errors.push(message);
const note = (message: string) => notes.push(message);

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function gitShortHead(): string | null {
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function main() {
  if (!existsSync(build)) {
    console.error('build/ does not exist. Run `bun run build` first.');
    process.exit(1);
  }

  const tag = process.env.RELEASE_TAG;
  const release = Boolean(tag);
  const pkg = readJson(resolve(root, 'package.json'));

  for (const rel of REQUIRED_FILES) {
    if (!existsSync(resolve(build, rel))) fail(`missing build/${rel}`);
  }

  const assetsDir = resolve(build, 'assets');
  const assets = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
  const mainBundle = assets.find((f) => /^main-[\w-]+\.js$/.test(f));
  if (!mainBundle) fail('missing build/assets/main-*.js');
  if (!assets.some((f) => /^sweep-tab-[\w-]+\.js$/.test(f))) fail('missing build/assets/sweep-tab-*.js');

  const manifestPath = resolve(build, 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = readJson(manifestPath);
    if (manifest.manifest_version !== 3) fail(`manifest_version is ${manifest.manifest_version}, expected 3`);
    if (manifest.version !== pkg.version) {
      fail(`version mismatch: package.json is ${pkg.version}, manifest.json is ${manifest.version}`);
    }
    const referenced: string[] = [
      manifest.background?.service_worker,
      manifest.action?.default_popup,
      ...(manifest.content_scripts ?? []).flatMap((cs: { js?: string[] }) => cs.js ?? []),
      ...Object.values(manifest.icons ?? {}),
    ].filter((p): p is string => typeof p === 'string');
    for (const rel of referenced) {
      if (!existsSync(resolve(build, rel))) fail(`manifest references a missing file: ${rel}`);
    }
  }

  if (tag) {
    const match = /^v(\d+\.\d+\.\d+)(?:-[0-9A-Za-z.]+)?$/.exec(tag);
    if (!match) fail(`RELEASE_TAG "${tag}" must look like v1.2.3 or v1.2.3-rc.1`);
    else if (match[1] !== pkg.version) fail(`RELEASE_TAG ${tag} does not match package.json version ${pkg.version}`);
  }

  // The popup bakes in `git rev-parse --short=7 HEAD` (see vite.config.ts). In release mode the
  // bundle must carry exactly the commit being released, from a clean tree.
  const head = gitShortHead();
  if (head && mainBundle) {
    const js = readFileSync(resolve(assetsDir, mainBundle), 'utf-8');
    const report = release ? fail : note;
    if (new RegExp(`\\b${head}-dirty\\b`).test(js)) {
      report(`popup bundle was built from a dirty working tree (${head}-dirty)`);
    } else if (new RegExp(`\\b${head}\\b`).test(js)) {
      note(`popup bundle carries build commit ${head}`);
    } else {
      report(`popup bundle does not carry the current commit ${head}; build/ is stale or from another commit`);
    }
  }

  for (const n of notes) console.log(`  · ${n}`);
  if (errors.length) {
    console.error('\n  ✗ build verification failed');
    for (const e of errors) console.error(`    - ${e}`);
    process.exit(1);
  }
  console.log(`  ✓ build/ verified (v${pkg.version}${tag ? `, ${tag}` : ''})`);
}

main();
