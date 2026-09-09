/**
 * Cuts a release: bumps the version, commits, tags, and pushes. GitHub Actions
 * (.github/workflows/release.yml) then builds, packages, attests, and drafts the release.
 *
 * Usage:
 *   bun run release <version> [--yes]
 *   bun run release 5.0.4
 *
 * Preconditions: on main, clean tree, in sync with origin/main, tag does not exist yet.
 * See docs/releasing.md for the full flow.
 */
import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const VERSION_FILES = ['package.json', 'public/manifest.json'];

function die(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function git(args: string, { quiet = false } = {}): string {
  return execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] })
    .toString()
    .trim();
}

function run(command: string) {
  const result = spawnSync(command, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) die(`"${command}" failed`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes') || args.includes('-y');
  const raw = args.find((a) => !a.startsWith('-'));
  if (!raw) die('usage: bun run release <version> [--yes]    e.g. bun run release 5.0.4');
  const version = raw.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    die(`"${raw}" is not a plain X.Y.Z version. Prerelease tags are pushed by hand; see docs/releasing.md.`);
  }
  return { version, yes };
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function bumpVersionFile(rel: string, version: string) {
  const path = resolve(root, rel);
  const before = readFileSync(path, 'utf-8');
  let replaced = 0;
  const after = before.replace(/^(\s*"version":\s*")[^"]*(")/m, (_m, open, close) => {
    replaced++;
    return `${open}${version}${close}`;
  });
  if (replaced !== 1 || JSON.parse(after).version !== version) die(`could not update the version in ${rel}`);
  writeFileSync(path, after);
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((res) => rl.question(question, res));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const { version, yes } = parseArgs();
  const tag = `v${version}`;
  const current = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')).version as string;

  const branch = git('rev-parse --abbrev-ref HEAD', { quiet: true });
  if (branch !== 'main') die(`releases are cut from main (currently on ${branch})`);
  if (git('status --porcelain', { quiet: true })) die('working tree is not clean; commit or stash first');
  git('fetch origin main', { quiet: true });
  if (git('rev-parse HEAD') !== git('rev-parse origin/main')) die('main is not in sync with origin/main');
  if (git(`tag --list ${tag}`)) die(`tag ${tag} already exists locally`);
  if (git(`ls-remote --tags origin refs/tags/${tag}`, { quiet: true })) die(`tag ${tag} already exists on origin`);
  if (compareVersions(version, current) <= 0) die(`${version} is not newer than the current version ${current}`);

  const repo = git('remote get-url origin')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '');

  console.log(`\n  Release ${tag}  (current: v${current})\n`);
  console.log('  1. check formatting and types');
  console.log(`  2. bump the version in ${VERSION_FILES.join(' and ')}`);
  console.log(`  3. commit "Update version to ${tag}", tag ${tag}, push main and the tag`);
  console.log('  4. GitHub Actions builds, packages, attests, and drafts the release\n');
  if (!yes && !(await confirm('  Proceed? [y/N] '))) die('aborted');

  run('bun run format:check');
  run('bun run typecheck');

  for (const file of VERSION_FILES) bumpVersionFile(file, version);
  git(`add ${VERSION_FILES.join(' ')}`);
  git(`commit -m "Update version to ${tag}"`);
  git(`tag -a ${tag} -m "Release ${tag}"`);
  git('push origin main');
  git(`push origin ${tag}`);

  console.log(`\n  ✓ pushed ${tag}\n`);
  console.log(`  Watch the build:  ${repo}/actions/workflows/release.yml`);
  console.log(`  When it is green: ${repo}/releases`);
  console.log(`                    download pw-${tag}.zip from the draft, upload it to the Chrome Web Store,`);
  console.log('                    then publish the draft.\n');
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
