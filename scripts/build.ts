import { build } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');

async function buildExtension() {
  console.log('Building Chrome Extension...\n');

  // 1. Build main popup/extension pages (clears output dir)
  console.log('1. Building main popup...');
  await build({
    configFile: resolve(rootDir, 'vite.config.ts'),
  });
  console.log('   Done.\n');

  // 2. Build background service worker (ES module)
  console.log('2. Building background service worker...');
  await build({
    configFile: resolve(rootDir, 'vite.config.background.ts'),
  });
  console.log('   Done.\n');

  // 3. Build content script (IIFE)
  console.log('3. Building content script...');
  await build({
    configFile: resolve(rootDir, 'vite.config.content.ts'),
  });
  console.log('   Done.\n');

  // 4. Build inject script (IIFE)
  console.log('4. Building inject script...');
  await build({
    configFile: resolve(rootDir, 'vite.config.inject.ts'),
  });
  console.log('   Done.\n');

  console.log('Build complete!');
}

buildExtension().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
