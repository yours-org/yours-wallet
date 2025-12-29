import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  plugins: [
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
  optimizeDeps: {
    exclude: ['@1sat/wallet-toolbox'],
  },
  build: {
    outDir: 'build',
    commonjsOptions: {
      exclude: [/1sat-wallet-toolbox/],
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        inject: resolve(__dirname, 'src/inject.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (['background', 'content', 'inject'].includes(chunkInfo.name)) {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
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
