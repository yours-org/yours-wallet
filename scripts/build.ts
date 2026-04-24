import { build } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import chalk from 'chalk';

// ─── Paths ───────────────────────────────────────────────────
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'build');
const META = resolve(__dirname, '.build-meta.json');

// ─── Build pipeline ──────────────────────────────────────────
const STEPS = [
  { name: 'Popup UI', tag: 'Popup UI', cfg: 'vite.config.ts', out: ['assets'] },
  { name: 'Service Worker', tag: 'Worker', cfg: 'vite.config.background.ts', out: ['background.js'] },
  { name: 'Content Script', tag: 'Content', cfg: 'vite.config.content.ts', out: ['content.js'] },
  { name: 'Inject Script', tag: 'Inject', cfg: 'vite.config.inject.ts', out: ['inject.js'] },
] as const;

// ─── Theme ───────────────────────────────────────────────────
const accent = chalk.hex('#A1FF8B');
const ok = chalk.green;
const fail = chalk.red;
const dim = chalk.dim;
const bold = chalk.bold;

// ─── Terminal helpers ────────────────────────────────────────
const rawWrite = process.stdout.write.bind(process.stdout);
const hideCursor = () => rawWrite('\x1b[?25l');
const showCursor = () => rawWrite('\x1b[?25h');

function mute() {
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  return () => {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  };
}

// ─── Spinner ─────────────────────────────────────────────────
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function spinner(text: string) {
  let i = 0;
  hideCursor();
  const id = setInterval(() => {
    rawWrite(`\r  ${accent(SPIN[i++ % SPIN.length])} ${text}  `);
  }, 80);
  return (line: string) => {
    clearInterval(id);
    rawWrite(`\x1b[2K\r  ${line}\n`);
    showCursor();
  };
}

// ─── Size helpers ────────────────────────────────────────────
function measureDir(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) total += measureDir(full);
    else if (!entry.name.endsWith('.map')) total += statSync(full).size;
  }
  return total;
}

function measureOutputs(paths: readonly string[]): number {
  return paths.reduce((sum, p) => {
    const full = resolve(dist, p);
    if (!existsSync(full)) return sum;
    const stat = statSync(full);
    return sum + (stat.isDirectory() ? measureDir(full) : stat.size);
  }, 0);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const k = n / 1024;
  return k < 1024 ? `${Math.round(k)} kB` : `${(k / 1024).toFixed(1)} MB`;
}

function fmtDelta(now: number, prev?: number): string {
  if (prev == null) return dim('new');
  const diff = now - prev;
  if (Math.abs(diff) < 512) return dim('±0');
  return diff > 0 ? fail(`+${fmtBytes(diff)}`) : ok(`-${fmtBytes(Math.abs(diff))}`);
}

// ─── Build metadata (persists across builds) ─────────────────
type Meta = { sizes: Record<string, number>; total: number; streak: number };

function loadMeta(): Meta {
  try {
    return JSON.parse(readFileSync(META, 'utf-8'));
  } catch {
    return { sizes: {}, total: 0, streak: 0 };
  }
}

function saveMeta(meta: Meta) {
  writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
}

// ─── Blockchain visualization ────────────────────────────────
function center(text: string, width: number): string {
  const pad = width - text.length;
  if (pad <= 0) return text.slice(0, width);
  const left = Math.floor(pad / 2);
  return ' '.repeat(left) + text + ' '.repeat(pad - left);
}

function printChain(blocks: { tag: string; bytes: number }[]) {
  const W = 12;
  const link = accent('━━━');
  const gap = '   ';
  const rows = ['', '', '', ''];

  for (let i = 0; i < blocks.length; i++) {
    const { tag, bytes } = blocks[i];
    const last = i === blocks.length - 1;

    rows[0] += dim(`╔${'═'.repeat(W)}╗`) + (last ? '' : gap);
    rows[1] += dim('║') + bold(center(tag, W)) + dim('║') + (last ? '' : link);
    rows[2] += dim('║') + dim(center(fmtBytes(bytes), W)) + dim('║') + (last ? '' : gap);
    rows[3] += dim(`╚${'═'.repeat(W)}╝`) + (last ? '' : gap);
  }

  console.log();
  for (const row of rows) console.log('  ' + row);
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
  const meta = loadMeta();

  // Header
  console.log();
  console.log(accent.bold('  🌱 YOURS WALLET'));
  console.log(dim(`  v${version}  ·  Chrome Extension  ·  ${new Date().toLocaleTimeString()}`));
  console.log(dim('  ' + '━'.repeat(40)));
  console.log();

  const results: { tag: string; bytes: number; ms: number }[] = [];
  const t0 = Date.now();

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    const idx = dim(`[${i + 1}/${STEPS.length}]`);
    const done = spinner(`${idx} Building ${step.name}...`);
    const t = Date.now();

    try {
      const unmute = mute();
      await build({ configFile: resolve(root, step.cfg), logLevel: 'silent' });
      unmute();
    } catch (err) {
      done(`${fail('✗')} ${idx} ${step.name}  ${fail('FAILED')}`);
      throw err;
    }

    const ms = Date.now() - t;
    const bytes = measureOutputs(step.out);
    const time = dim(`${(ms / 1000).toFixed(1)}s`);
    const size = bold(fmtBytes(bytes));
    const diff = fmtDelta(bytes, meta.sizes[step.tag]);

    done(`${ok('✓')} ${idx} ${step.name}  ${time}  ${size}  ${diff}`);
    results.push({ tag: step.tag, bytes, ms });
  }

  const elapsed = Date.now() - t0;
  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const streak = meta.streak + 1;

  // Blockchain
  printChain(results);

  // Summary
  console.log();
  console.log(dim('  ' + '━'.repeat(40)));

  const totalDelta = meta.total ? fmtDelta(totalBytes, meta.total) : '';
  const timing = `${bold(`${(elapsed / 1000).toFixed(1)}s`)}`;
  const total = bold(fmtBytes(totalBytes));

  console.log([ok.bold('  ✓ Confirmed'), dim('in'), timing, dim('·'), total, totalDelta].filter(Boolean).join(' '));

  if (streak >= 10) {
    console.log(accent(`  🌳 Build streak: ${streak}`));
  } else if (streak >= 5) {
    console.log(accent(`  🌿 Build streak: ${streak}`));
  } else {
    console.log(dim(`  Build #${streak}`));
  }

  console.log();

  saveMeta({
    sizes: Object.fromEntries(results.map((r) => [r.tag, r.bytes])),
    total: totalBytes,
    streak,
  });
}

main().catch((err) => {
  showCursor();
  console.error(fail('\n  ✗ Build failed\n'));
  console.error(err);
  try {
    const meta = loadMeta();
    saveMeta({ ...meta, streak: 0 });
  } catch {}
  process.exit(1);
});
