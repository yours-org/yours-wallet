import { defineConfig, type Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve } from 'path';

const waSqliteNoop: Plugin = {
  name: 'wa-sqlite-noop',
  resolveId(source) {
    if (source === 'wa-sqlite' || source.startsWith('wa-sqlite/')) {
      return resolve(__dirname, 'src/shims/wa-sqlite-noop.ts');
    }
  },
};

// Background service worker config - ES module format
export default defineConfig({
  base: './',
  plugins: [
    waSqliteNoop,
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream', 'crypto', 'assert', 'url', 'path'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      path: 'path-browserify',
    },
    preserveSymlinks: true,
  },
  build: {
    outDir: 'build',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/background.ts'),
      name: 'background',
      formats: ['es'],
      fileName: () => 'background.js',
    },
    rollupOptions: {
      external: ['chrome'],
    },
    sourcemap: true,
  },
  define: {
    'process.env': {},
  },
});
