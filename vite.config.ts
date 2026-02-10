import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
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

// Main config for popup/extension pages
export default defineConfig({
  base: './',
  plugins: [
    waSqliteNoop,
    react(),
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
  publicDir: 'public',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    sourcemap: true,
  },
  define: {
    'process.env': {},
  },
});
