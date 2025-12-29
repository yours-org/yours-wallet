import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve } from 'path';

// Background service worker config - ES module format
export default defineConfig({
  base: './',
  plugins: [
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
  optimizeDeps: {
    exclude: ['@1sat/wallet-toolbox'],
  },
  build: {
    outDir: 'build',
    emptyOutDir: false,
    commonjsOptions: {
      exclude: [/1sat-wallet-toolbox/],
    },
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
