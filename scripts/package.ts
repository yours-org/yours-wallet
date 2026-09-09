/**
 * Packages build/ into a reproducible release zip plus checksums, written to release/:
 *
 *   release/pw-<tag>.zip          the extension, ready for the Chrome Web Store
 *   release/pw-<tag>.zip.sha256   checksum of the zip (`sha256sum -c` compatible)
 *   release/SHA256SUMS            checksum of every file inside the zip
 *
 * The zip is byte-for-byte reproducible: entries are sorted, every timestamp is the
 * packaged commit's time (or SOURCE_DATE_EPOCH), permissions are fixed, and macOS
 * metadata is excluded. Two builds of the same commit produce the same hash.
 *
 * <tag> is RELEASE_TAG if set, otherwise v<package.json version>.
 */
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { posix, resolve } from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const build = resolve(root, 'build');
const out = resolve(root, 'release');

// Files are stored under this folder inside the zip, matching how releases have always shipped.
const ZIP_ROOT = 'build';
const EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db']);
const EXCLUDED_DIRS = new Set(['builds']);

function walk(dir: string, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? posix.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) files.push(...walk(resolve(dir, entry.name), rel));
    } else if (!EXCLUDED_FILES.has(entry.name)) {
      files.push(rel);
    }
  }
  return files;
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function commitEpoch(): number | null {
  try {
    const out = execSync('git log -1 --format=%ct', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
    const epoch = Number(out.toString().trim());
    return Number.isFinite(epoch) ? epoch : null;
  } catch {
    return null;
  }
}

function entryDate(): Date {
  const fromEnv = process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) : NaN;
  // Zip timestamps cannot predate 1980, which is the fallback when no commit time is available.
  const epoch = Number.isFinite(fromEnv) ? fromEnv : (commitEpoch() ?? 315532800);
  return new Date(epoch * 1000);
}

async function main() {
  if (!existsSync(build)) {
    console.error('build/ does not exist. Run `bun run build` first.');
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
  const tag = process.env.RELEASE_TAG || `v${pkg.version}`;
  const zipName = `pw-${tag}.zip`;
  const date = entryDate();

  // Default string sort is by UTF-16 code unit, so the order is identical on every platform.
  const files = walk(build).sort();
  if (files.length === 0) throw new Error('build/ is empty');

  const zip = new JSZip();
  const sums: string[] = [];
  let totalBytes = 0;
  for (const rel of files) {
    const data = readFileSync(resolve(build, rel));
    const entry = posix.join(ZIP_ROOT, rel);
    sums.push(`${sha256(data)}  ${entry}`);
    totalBytes += data.length;
    zip.file(entry, data, {
      date,
      unixPermissions: 0o644,
      createFolders: false,
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    streamFiles: false,
  });
  const zipHash = sha256(buffer);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, zipName), buffer);
  writeFileSync(resolve(out, `${zipName}.sha256`), `${zipHash}  ${zipName}\n`);
  writeFileSync(resolve(out, 'SHA256SUMS'), sums.join('\n') + '\n');

  const mb = (n: number) => (n / 1048576).toFixed(1);
  console.log(`\n  ${zipName}`);
  console.log(`  sha256  ${zipHash}`);
  console.log(`  ${files.length} files · ${mb(totalBytes)} MB unpacked · ${mb(buffer.length)} MB zipped`);
  console.log('  written to release/\n');

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `### ${zipName}`,
        '',
        '| | |',
        '|---|---|',
        `| sha256 | \`${zipHash}\` |`,
        `| files | ${files.length} |`,
        `| size | ${mb(buffer.length)} MB |`,
        '',
      ].join('\n'),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
