import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve } from 'path';

// Inject script config - IIFE format (runs in page context)
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
  logLevel: 'error',
  build: {
    outDir: 'build',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/inject.ts'),
      name: 'inject',
      formats: ['iife'],
      fileName: () => 'inject.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
      onwarn(warning, warn) {
        if (warning.message?.includes('externalized for browser')) return;
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        warn(warning);
      },
    },
    sourcemap: true,
  },
  define: {
    'process.env': {},
  },
});
