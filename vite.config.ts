import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve } from 'path';
import { execSync } from 'child_process';

const gitCommit = (() => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    // -uno: only tracked-file changes count as dirty, matching `git describe --dirty`
    const dirty = execSync('git status --porcelain -uno', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return dirty ? `${hash}-dirty` : hash;
  } catch {
    return 'unknown';
  }
})();

// Main config for popup/extension pages
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
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
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'sweep-tab': resolve(__dirname, 'sweep-tab.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.message?.includes('externalized for browser')) return;
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        if (warning.message?.includes('while both modules are dependencies of each other')) return;
        warn(warning);
      },
    },
    sourcemap: true,
  },
  define: {
    'process.env': {},
    __BUILD_COMMIT__: JSON.stringify(gitCommit),
  },
});
